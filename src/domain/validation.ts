import type {
  Account,
  Instrument,
  Order,
  OrderRequest,
  OrderReservation,
  Position,
  Quote,
  ValidationIssue,
  ValidationResult,
} from './contracts';
import {
  compareDecimal,
  grossMinor,
  isTickAligned,
  minor,
  multiplyDecimalRatio,
  parseDecimal,
} from './exact';
import { estimateFees } from './fees';
import type { DecimalString, ISODate, ISOInstant, MinorUnitString } from './primitives';
import {
  getSessionState,
  isWithinPriceLimits,
  priceLimitRange,
  tickForPrice,
  type MarketRuleSet,
} from './rules';

export interface ValidationContext {
  readonly account: Account;
  readonly instrument?: Instrument;
  readonly rules?: MarketRuleSet;
  readonly at: ISOInstant;
  readonly quote?: Quote;
  readonly reservations?: Readonly<Record<string, OrderReservation>>;
  readonly openOrders?: Readonly<Record<string, Order>>;
  readonly maxQuoteAgeMs?: number;
}

export interface CashRequirement {
  readonly referencePrice: DecimalString;
  readonly grossMinor: MinorUnitString;
  readonly feeMinor: MinorUnitString;
  readonly totalMinor: MinorUnitString;
}

function issue(
  code: ValidationIssue['code'],
  message: string,
  field?: ValidationIssue['field'],
): ValidationIssue {
  return { code, message, ...(field ? { field } : {}) };
}

function isPositiveDecimal(value: DecimalString): boolean {
  try {
    return parseDecimal(value).coefficient > 0n;
  } catch {
    return false;
  }
}

export function sellableQuantity(position: Position | undefined, tradeDate: ISODate): number {
  if (!position) return 0;
  return position.lots
    .filter((lot) => lot.sellableOn <= tradeDate)
    .reduce((total, lot) => total + lot.quantity, 0);
}

function reservedSellQuantity(
  instrumentId: string,
  reservations: Readonly<Record<string, OrderReservation>> | undefined,
): number {
  if (!reservations) return 0;
  return Object.values(reservations)
    .filter((reservation) => reservation.instrumentId === instrumentId)
    .reduce((total, reservation) => total + reservation.sellQuantity, 0);
}

function referencePriceForBuy(
  request: OrderRequest,
  quote: Quote | undefined,
): DecimalString | undefined {
  if (request.type === 'LIMIT' || request.type === 'STOP_LIMIT') return request.limitPrice;
  if (request.type === 'MARKET') return quote?.ask;
  if (!request.stopPrice || !quote) return undefined;
  const triggerReference = compareDecimal(request.stopPrice, quote.ask) > 0 ? request.stopPrice : quote.ask;
  // A stop-market order reserves a deterministic 5% gap buffer. Actual execution still
  // re-checks buying power if a more extreme gap occurs.
  return multiplyDecimalRatio(triggerReference, 10_500n, 10_000n, 8, 'UP');
}

export function estimateOrderCashRequirement(
  request: OrderRequest,
  instrument: Instrument,
  rules: MarketRuleSet,
  quote?: Quote,
): CashRequirement | undefined {
  if (request.side !== 'BUY') return undefined;
  const referencePrice = referencePriceForBuy(request, quote);
  if (!referencePrice || !isPositiveDecimal(referencePrice)) return undefined;
  const gross = grossMinor(referencePrice, request.quantity, instrument.currency, 'UP');
  const fee = estimateFees({
    instrument,
    rules,
    side: request.side,
    price: referencePrice,
    quantity: request.quantity,
  });
  return {
    referencePrice,
    grossMinor: gross,
    feeMinor: fee.totalMinor,
    totalMinor: (BigInt(gross) + BigInt(fee.totalMinor)).toString(),
  };
}

function validatePriceField(
  value: DecimalString,
  field: 'limitPrice' | 'stopPrice',
  instrument: Instrument,
  rules: MarketRuleSet,
): readonly ValidationIssue[] {
  if (!isPositiveDecimal(value)) {
    return [issue('INVALID_PRICE', `${field === 'limitPrice' ? 'Limit' : 'Stop'} price must be a positive decimal string.`, field)];
  }
  const tick = tickForPrice(instrument, value, rules);
  const issues: ValidationIssue[] = [];
  if (!isTickAligned(value, tick)) {
    issues.push(issue('TICK_SIZE', `Price ${value} is not aligned to the ${tick} tick.`, field));
  }
  if (!isWithinPriceLimits(value, instrument, rules)) {
    const range = priceLimitRange(instrument, rules);
    issues.push(
      issue(
        'PRICE_LIMIT',
        `Price ${value} is outside today's permitted range ${range?.lower}-${range?.upper}.`,
        field,
      ),
    );
  }
  return issues;
}

function validateLot(
  request: OrderRequest,
  instrument: Instrument,
  availableToSell: number,
): ValidationIssue | undefined {
  const lot = instrument.boardLot;
  const minimum = instrument.minOrderQuantity ?? lot;
  if (request.quantity < minimum && (request.side === 'BUY' || request.quantity !== availableToSell)) {
    return issue('LOT_SIZE', `Minimum order quantity is ${minimum} shares.`, 'quantity');
  }

  if (request.side === 'BUY') {
    // STAR instruments can declare boardLot=1/minOrderQuantity=200, matching the current
    // minimum-200 then one-share increment policy. Other A shares and HK counters use lots.
    if (request.quantity % lot !== 0) {
      return issue('LOT_SIZE', `Buy quantity must be a multiple of the ${lot}-share board lot.`, 'quantity');
    }
    return undefined;
  }

  if (request.quantity % lot !== 0 && request.quantity !== availableToSell) {
    return issue(
      'LOT_SIZE',
      `Odd-lot sells must liquidate the entire ${availableToSell}-share sellable position.`,
      'quantity',
    );
  }
  return undefined;
}

export function validateOrderRequest(
  request: OrderRequest,
  context: ValidationContext,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const instrument = context.instrument;
  const rules = context.rules;
  if (!instrument || !rules) {
    return {
      valid: false,
      issues: [issue('UNKNOWN_INSTRUMENT', `Instrument ${request.instrumentId} is not available.`, 'instrumentId')],
    };
  }
  if (!instrument.active) {
    issues.push(issue('INSTRUMENT_INACTIVE', `${instrument.displaySymbol} is not currently tradable.`, 'instrumentId'));
  }
  if (!Number.isSafeInteger(request.quantity) || request.quantity <= 0) {
    issues.push(issue('INVALID_QUANTITY', 'Quantity must be a positive whole number.', 'quantity'));
  }

  const session = getSessionState(rules, context.at);
  if (session.phase === 'CLOSED') {
    issues.push(issue('MARKET_CLOSED', `${instrument.market} market is closed at ${session.localTime}.`));
  } else if (!session.acceptedOrderTypes.includes(request.type)) {
    issues.push(
      issue('ORDER_TYPE_NOT_ALLOWED', `${request.type} orders are not accepted during ${session.phase}.`, 'type'),
    );
  }
  if (!rules.supportedTimeInForce.includes(request.timeInForce)) {
    issues.push(
      issue(
        'TIME_IN_FORCE_NOT_ALLOWED',
        `${request.timeInForce} is not supported for ${instrument.market} orders.`,
        'timeInForce',
      ),
    );
  }

  const requiresLimit = request.type === 'LIMIT' || request.type === 'STOP_LIMIT';
  const requiresStop = request.type === 'STOP' || request.type === 'STOP_LIMIT';
  if (requiresLimit && request.limitPrice === undefined) {
    issues.push(issue('MISSING_PRICE', `${request.type} requires a limit price.`, 'limitPrice'));
  }
  if (requiresStop && request.stopPrice === undefined) {
    issues.push(issue('MISSING_PRICE', `${request.type} requires a stop price.`, 'stopPrice'));
  }
  if (!requiresLimit && request.limitPrice !== undefined) {
    issues.push(issue('UNEXPECTED_PRICE', `${request.type} does not accept a limit price.`, 'limitPrice'));
  }
  if (!requiresStop && request.stopPrice !== undefined) {
    issues.push(issue('UNEXPECTED_PRICE', `${request.type} does not accept a stop price.`, 'stopPrice'));
  }
  if (request.limitPrice !== undefined) {
    issues.push(...validatePriceField(request.limitPrice, 'limitPrice', instrument, rules));
  }
  if (request.stopPrice !== undefined) {
    issues.push(...validatePriceField(request.stopPrice, 'stopPrice', instrument, rules));
  }

  if ((request.type === 'MARKET' || request.type === 'STOP') && !context.quote) {
    issues.push(issue('MISSING_QUOTE', `${request.type} requires a current quote.`));
  }
  if (context.quote) {
    const quoteTime = new Date(context.quote.at).getTime();
    const submissionTime = new Date(context.at).getTime();
    const maxAge = context.maxQuoteAgeMs ?? 60_000;
    if (!Number.isFinite(quoteTime) || Math.abs(submissionTime - quoteTime) > maxAge) {
      issues.push(issue('STALE_QUOTE', `Quote is more than ${maxAge}ms from the submission time.`));
    }
  }

  if (request.clientOrderId && context.openOrders) {
    const duplicate = Object.values(context.openOrders).some(
      (order) => order.clientOrderId === request.clientOrderId,
    );
    if (duplicate) {
      issues.push(issue('DUPLICATE_CLIENT_ORDER_ID', `Client order id ${request.clientOrderId} already exists.`, 'clientOrderId'));
    }
  }

  if (Number.isSafeInteger(request.quantity) && request.quantity > 0) {
    const maxQuantity = instrument.maxOrderQuantity ?? rules.defaultMaxOrderQuantity;
    if (request.quantity > maxQuantity) {
      issues.push(issue('ORDER_SIZE_LIMIT', `Maximum order size is ${maxQuantity} shares.`, 'quantity'));
    }

    const position = context.account.positions[instrument.id];
    const rawSellable = sellableQuantity(position, session.marketDate);
    const reserved = reservedSellQuantity(instrument.id, context.reservations);
    const available = Math.max(0, rawSellable - reserved);
    const lotIssue = validateLot(request, instrument, available);
    if (lotIssue) issues.push(lotIssue);

    if (request.side === 'SELL') {
      const totalUnreserved = Math.max(0, (position?.quantity ?? 0) - reserved);
      if (request.quantity > available) {
        if (!rules.sameDaySaleAllowed && request.quantity <= totalUnreserved) {
          issues.push(
            issue(
              'T_PLUS_ONE',
              `${request.quantity} shares are held, but only ${available} are sellable before T+1.`,
              'quantity',
            ),
          );
        } else {
          issues.push(
            issue(
              'INSUFFICIENT_POSITION',
              `Only ${available} unreserved shares are available to sell.`,
              'quantity',
            ),
          );
        }
      }
    } else {
      const requirement = estimateOrderCashRequirement(request, instrument, rules, context.quote);
      if (requirement) {
        const balance = context.account.cash[instrument.currency];
        const buyingPower = BigInt(minor(balance.buyingPowerMinor));
        if (BigInt(requirement.totalMinor) > buyingPower) {
          issues.push(
            issue(
              'INSUFFICIENT_BUYING_POWER',
              `Order needs ${requirement.totalMinor} minor units; ${buyingPower.toString()} are available.`,
              'quantity',
            ),
          );
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
