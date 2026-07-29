import type {
  Account,
  CashBalance,
  FeeBreakdown,
  Fill,
  Instrument,
  Order,
  OrderEvent,
  OrderEventType,
  OrderRequest,
  OrderReservation,
  OrderStatus,
  Position,
  PositionLot,
  Quote,
  SimulationState,
  ValidationCode,
} from './contracts';
import {
  averagePriceFromMinor,
  compareDecimal,
  divideRounded,
  grossMinor,
  minor,
  weightedAveragePrice,
} from './exact';
import { estimateFees, incrementalFees } from './fees';
import type { Currency, ISODate, ISOInstant, MinorUnitString } from './primitives';
import {
  addBusinessDays,
  getMarketRules,
  getSessionState,
  isWithinPriceLimits,
  marketDate,
} from './rules';
import {
  estimateOrderCashRequirement,
  sellableQuantity,
  validateOrderRequest,
} from './validation';

export interface SimulationEngineConfig {
  readonly instruments: readonly Instrument[];
  readonly account?: Account;
  readonly state?: SimulationState;
}

export interface SubmitContext {
  readonly at: ISOInstant;
  readonly quote?: Quote;
  readonly executeImmediately?: boolean;
}

const TERMINAL_STATUSES: readonly OrderStatus[] = ['FILLED', 'REJECTED', 'CANCELLED', 'EXPIRED'];

function emptyCash(currency: Currency): CashBalance {
  return { currency, balanceMinor: '0', reservedMinor: '0', buyingPowerMinor: '0' };
}

function normalizeAccount(account: Account): Account {
  const currencies: readonly Currency[] = ['USD', 'HKD', 'CNY'];
  const cash = Object.fromEntries(
    currencies.map((currency) => {
      const source = account.cash[currency] ?? emptyCash(currency);
      return [currency, {
        currency,
        balanceMinor: minor(source.balanceMinor),
        reservedMinor: minor(source.reservedMinor),
        buyingPowerMinor: minor(source.buyingPowerMinor),
      }];
    }),
  ) as unknown as Record<Currency, CashBalance>;
  return {
    ...account,
    cash,
    realizedPnlMinorByCurrency: {
      USD: minor(account.realizedPnlMinorByCurrency.USD ?? '0'),
      HKD: minor(account.realizedPnlMinorByCurrency.HKD ?? '0'),
      CNY: minor(account.realizedPnlMinorByCurrency.CNY ?? '0'),
    },
  };
}

function initialState(account: Account): SimulationState {
  return {
    account: normalizeAccount(account),
    orders: {},
    events: [],
    fills: [],
    reservations: {},
    sequence: 0,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function padded(sequence: number): string {
  return sequence.toString().padStart(8, '0');
}

function assertSafeQuote(quote: Quote): void {
  if (!Number.isSafeInteger(quote.bidSize) || quote.bidSize < 0) throw new RangeError('Invalid bid size.');
  if (!Number.isSafeInteger(quote.askSize) || quote.askSize < 0) throw new RangeError('Invalid ask size.');
  if (compareDecimal(quote.bid, '0') <= 0 || compareDecimal(quote.ask, '0') <= 0) {
    throw new RangeError('Quote prices must be positive.');
  }
  if (compareDecimal(quote.bid, quote.ask) > 0) throw new RangeError('Quote bid cannot exceed ask.');
}

export class SimulationEngine {
  private readonly instrumentById: ReadonlyMap<string, Instrument>;
  private state: SimulationState;

  public constructor(config: SimulationEngineConfig) {
    if ((config.account === undefined) === (config.state === undefined)) {
      throw new TypeError('Provide exactly one of account or state.');
    }
    const map = new Map(config.instruments.map((instrument) => [instrument.id, instrument]));
    if (map.size !== config.instruments.length) throw new TypeError('Instrument ids must be unique.');
    this.instrumentById = map;
    this.state = config.state ? clone(config.state) : initialState(config.account as Account);
    this.assertRestoredState();
  }

  public static fromSnapshot(
    instruments: readonly Instrument[],
    state: SimulationState,
  ): SimulationEngine {
    return new SimulationEngine({ instruments, state });
  }

  public snapshot(): SimulationState {
    return clone(this.state);
  }

  public getOrder(orderId: string): Order | undefined {
    const order = this.state.orders[orderId];
    return order ? clone(order) : undefined;
  }

  public submit(request: OrderRequest, context: SubmitContext): Order {
    const ordersBeforeSubmission = this.state.orders;
    const sequence = this.bumpSequence();
    const id = `ord-${padded(sequence)}`;
    let order: Order = {
      ...request,
      id,
      accountId: this.state.account.id,
      status: 'PENDING_VALIDATION',
      filledQuantity: 0,
      remainingQuantity: request.quantity,
      submittedAt: context.at,
      updatedAt: context.at,
      sequence,
    };
    this.replaceOrder(order);
    this.appendEvent(order, 'SUBMITTED', 'Order submitted for validation.', context.at);

    const instrument = this.instrumentById.get(request.instrumentId);
    const rules = instrument ? getMarketRules(instrument.market, context.at) : undefined;
    const validation = validateOrderRequest(request, {
      account: this.state.account,
      instrument,
      rules,
      at: context.at,
      quote: context.quote,
      reservations: this.state.reservations,
      openOrders: ordersBeforeSubmission,
    });
    if (!validation.valid) {
      const first = validation.issues[0];
      order = {
        ...order,
        status: 'REJECTED',
        updatedAt: context.at,
        rejectionCode: first.code,
        statusReason: validation.issues.map((item) => item.message).join(' '),
      };
      this.replaceOrder(order);
      this.appendEvent(order, 'REJECTED', order.statusReason ?? 'Order rejected.', context.at, first.code);
      return clone(order);
    }

    const reservation = this.createReservation(order, instrument as Instrument, rules!, context.quote);
    this.state = {
      ...this.state,
      reservations: { ...this.state.reservations, [id]: reservation },
    };
    order = { ...order, status: 'ACCEPTED', updatedAt: context.at };
    this.replaceOrder(order);
    this.refreshAccount(context.at);
    this.appendEvent(order, 'ACCEPTED', 'Order accepted and resources reserved.', context.at);

    if (context.quote && context.executeImmediately !== false) this.processQuote(context.quote);
    return clone(this.state.orders[id]);
  }

  public processQuote(quote: Quote): readonly Fill[] {
    assertSafeQuote(quote);
    const instrument = this.instrumentById.get(quote.instrumentId);
    if (!instrument) throw new RangeError(`Unknown instrument ${quote.instrumentId}.`);
    const rules = getMarketRules(instrument.market, quote.at);
    const session = getSessionState(rules, quote.at);
    this.advance(quote.at);
    this.expireDayOrders(quote.at);
    if (session.phase !== 'CONTINUOUS') return [];
    if (!isWithinPriceLimits(quote.bid, instrument, rules) || !isWithinPriceLimits(quote.ask, instrument, rules)) {
      return [];
    }

    let askRemaining = quote.askSize;
    let bidRemaining = quote.bidSize;
    const beforeFillCount = this.state.fills.length;
    const candidates = Object.values(this.state.orders)
      .filter(
        (order) =>
          order.instrumentId === instrument.id &&
          !TERMINAL_STATUSES.includes(order.status) &&
          order.status !== 'PENDING_VALIDATION',
      )
      .sort((left, right) => left.sequence - right.sequence);

    for (const candidate of candidates) {
      let order = this.state.orders[candidate.id];
      if (order.remainingQuantity <= 0) continue;
      if ((order.type === 'STOP' || order.type === 'STOP_LIMIT') && !order.triggeredAt) {
        const triggered = order.side === 'BUY'
          ? compareDecimal(quote.last, order.stopPrice as string) >= 0
          : compareDecimal(quote.last, order.stopPrice as string) <= 0;
        if (!triggered) continue;
        order = { ...order, status: 'TRIGGERED', triggeredAt: quote.at, updatedAt: quote.at };
        this.replaceOrder(order);
        this.appendEvent(order, 'TRIGGERED', `Stop triggered at last price ${quote.last}.`, quote.at);
      }

      const executable = this.isExecutable(order, quote);
      if (!executable) continue;
      const sideLiquidity = order.side === 'BUY' ? askRemaining : bidRemaining;
      if (sideLiquidity <= 0) continue;
      const fillQuantity = Math.min(order.remainingQuantity, sideLiquidity);
      const fillPrice = order.side === 'BUY' ? quote.ask : quote.bid;
      if (!this.canFundFill(order, instrument, rules, fillPrice, fillQuantity)) {
        this.cancel(order.id, quote.at, 'Buying power changed before execution.');
        continue;
      }
      this.applyFill(order, instrument, rules, fillPrice, fillQuantity, quote.at);
      if (order.side === 'BUY') askRemaining -= fillQuantity;
      else bidRemaining -= fillQuantity;
    }

    return clone(this.state.fills.slice(beforeFillCount));
  }

  public cancel(orderId: string, at: ISOInstant, reason = 'Cancelled by user.'): Order {
    const existing = this.state.orders[orderId];
    if (!existing) throw new RangeError(`Unknown order ${orderId}.`);
    if (TERMINAL_STATUSES.includes(existing.status)) return clone(existing);
    const order: Order = { ...existing, status: 'CANCELLED', updatedAt: at, statusReason: reason };
    this.replaceOrder(order);
    this.releaseReservation(orderId, at);
    this.appendEvent(order, 'CANCELLED', reason, at);
    return clone(order);
  }

  public expireDayOrders(at: ISOInstant): readonly Order[] {
    const expired: Order[] = [];
    for (const current of Object.values(this.state.orders)) {
      if (current.timeInForce !== 'DAY' || TERMINAL_STATUSES.includes(current.status)) continue;
      const instrument = this.instrumentById.get(current.instrumentId);
      if (!instrument) continue;
      const submittedDate = marketDate(current.submittedAt, instrument.market);
      const currentDate = marketDate(at, instrument.market);
      if (currentDate <= submittedDate) continue;
      const order: Order = {
        ...current,
        status: 'EXPIRED',
        updatedAt: at,
        statusReason: 'DAY order expired at the end of its trading date.',
      };
      this.replaceOrder(order);
      this.releaseReservation(order.id, at);
      this.appendEvent(order, 'EXPIRED', order.statusReason!, at);
      expired.push(clone(order));
    }
    return expired;
  }

  /** Refreshes T+1 availability and buying power at a deterministic caller-supplied instant. */
  public advance(at: ISOInstant): void {
    this.refreshAccount(at);
  }

  private assertRestoredState(): void {
    if (!this.state.account?.id) throw new TypeError('Snapshot account is missing an id.');
    if (!Number.isSafeInteger(this.state.sequence) || this.state.sequence < 0) {
      throw new TypeError('Snapshot sequence is invalid.');
    }
    for (const order of Object.values(this.state.orders)) {
      if (!this.instrumentById.has(order.instrumentId)) {
        throw new TypeError(`Snapshot order ${order.id} references unknown instrument ${order.instrumentId}.`);
      }
    }
    this.state = { ...this.state, account: normalizeAccount(this.state.account) };
  }

  private bumpSequence(): number {
    const sequence = this.state.sequence + 1;
    this.state = { ...this.state, sequence };
    return sequence;
  }

  private replaceOrder(order: Order): void {
    this.state = { ...this.state, orders: { ...this.state.orders, [order.id]: order } };
  }

  private appendEvent(
    order: Order,
    type: OrderEventType,
    message: string,
    at: ISOInstant,
    code?: ValidationCode,
    fillId?: string,
  ): void {
    const sequence = this.bumpSequence();
    const event: OrderEvent = {
      id: `evt-${padded(sequence)}`,
      orderId: order.id,
      accountId: order.accountId,
      type,
      resultingStatus: order.status,
      at,
      sequence,
      message,
      ...(code ? { code } : {}),
      ...(fillId ? { fillId } : {}),
    };
    this.state = { ...this.state, events: [...this.state.events, event] };
  }

  private createReservation(
    order: Order,
    instrument: Instrument,
    rules: ReturnType<typeof getMarketRules>,
    quote?: Quote,
  ): OrderReservation {
    const requirement = estimateOrderCashRequirement(order, instrument, rules, quote);
    return {
      orderId: order.id,
      instrumentId: instrument.id,
      currency: instrument.currency,
      cashMinor: requirement?.totalMinor ?? '0',
      sellQuantity: order.side === 'SELL' ? order.remainingQuantity : 0,
      ...(requirement ? { referencePrice: requirement.referencePrice } : {}),
    };
  }

  private releaseReservation(orderId: string, at: ISOInstant): void {
    if (!this.state.reservations[orderId]) return;
    const reservations = { ...this.state.reservations };
    delete reservations[orderId];
    this.state = { ...this.state, reservations };
    this.refreshAccount(at);
  }

  private refreshAccount(at: ISOInstant, account = this.state.account): void {
    const reservedCash: Record<Currency, bigint> = { USD: 0n, HKD: 0n, CNY: 0n };
    const reservedSell = new Map<string, number>();
    for (const reservation of Object.values(this.state.reservations)) {
      reservedCash[reservation.currency] += BigInt(minor(reservation.cashMinor));
      reservedSell.set(
        reservation.instrumentId,
        (reservedSell.get(reservation.instrumentId) ?? 0) + reservation.sellQuantity,
      );
    }

    const cash = Object.fromEntries(
      (['USD', 'HKD', 'CNY'] as const).map((currency) => {
        const balance = account.cash[currency] ?? emptyCash(currency);
        const value = BigInt(minor(balance.balanceMinor));
        return [currency, {
          currency,
          balanceMinor: value.toString(),
          reservedMinor: reservedCash[currency].toString(),
          buyingPowerMinor: (value - reservedCash[currency]).toString(),
        } satisfies CashBalance];
      }),
    ) as unknown as Record<Currency, CashBalance>;

    const positions = Object.fromEntries(
      Object.entries(account.positions).map(([instrumentId, position]) => {
        const instrument = this.instrumentById.get(instrumentId);
        const tradeDate = instrument ? marketDate(at, instrument.market) : at.slice(0, 10);
        const settledQuantity = sellableQuantity(position, tradeDate);
        return [instrumentId, {
          ...position,
          settledQuantity,
          availableQuantity: Math.max(0, settledQuantity - (reservedSell.get(instrumentId) ?? 0)),
        } satisfies Position];
      }),
    );

    this.state = {
      ...this.state,
      account: { ...account, cash, positions, version: account.version + 1 },
    };
  }

  private isExecutable(order: Order, quote: Quote): boolean {
    if ((order.type === 'STOP' || order.type === 'STOP_LIMIT') && !order.triggeredAt) return false;
    if (order.type === 'MARKET' || order.type === 'STOP') return true;
    if (order.side === 'BUY') return compareDecimal(quote.ask, order.limitPrice as string) <= 0;
    return compareDecimal(quote.bid, order.limitPrice as string) >= 0;
  }

  private cumulativeExecution(orderId: string): { grossMinor: MinorUnitString; quantity: number } {
    const rows = this.state.fills.filter((fill) => fill.orderId === orderId);
    return {
      grossMinor: rows.reduce((total, fill) => total + BigInt(fill.grossMinor), 0n).toString(),
      quantity: rows.reduce((total, fill) => total + fill.quantity, 0),
    };
  }

  private feeForNextFill(
    order: Order,
    instrument: Instrument,
    rules: ReturnType<typeof getMarketRules>,
    price: string,
    quantity: number,
  ): { gross: MinorUnitString; fees: FeeBreakdown } {
    const previous = this.cumulativeExecution(order.id);
    const gross = grossMinor(price, quantity, instrument.currency);
    const cumulative = {
      instrument,
      rules,
      side: order.side,
      grossMinor: (BigInt(previous.grossMinor) + BigInt(gross)).toString(),
      quantity: previous.quantity + quantity,
    } as const;
    const fees = incrementalFees(
      previous.quantity > 0
        ? { instrument, rules, side: order.side, ...previous }
        : null,
      cumulative,
    );
    return { gross, fees };
  }

  private canFundFill(
    order: Order,
    instrument: Instrument,
    rules: ReturnType<typeof getMarketRules>,
    price: string,
    quantity: number,
  ): boolean {
    if (order.side === 'SELL') return true;
    const estimate = this.feeForNextFill(order, instrument, rules, price, quantity);
    const otherReserved = Object.values(this.state.reservations)
      .filter((reservation) => reservation.orderId !== order.id && reservation.currency === instrument.currency)
      .reduce((total, reservation) => total + BigInt(reservation.cashMinor), 0n);
    const balance = BigInt(this.state.account.cash[instrument.currency].balanceMinor);
    return BigInt(estimate.gross) + BigInt(estimate.fees.totalMinor) <= balance - otherReserved;
  }

  private updateReservationAfterFill(
    order: Order,
    instrument: Instrument,
    rules: ReturnType<typeof getMarketRules>,
  ): void {
    const current = this.state.reservations[order.id];
    if (!current) return;
    const reservations = { ...this.state.reservations };
    if (order.remainingQuantity === 0) {
      delete reservations[order.id];
    } else if (order.side === 'SELL') {
      reservations[order.id] = { ...current, sellQuantity: order.remainingQuantity };
    } else {
      const referencePrice = current.referencePrice as string;
      const fees = estimateFees({
        instrument,
        rules,
        side: order.side,
        price: referencePrice,
        quantity: order.remainingQuantity,
      });
      const gross = grossMinor(referencePrice, order.remainingQuantity, instrument.currency, 'UP');
      reservations[order.id] = {
        ...current,
        cashMinor: (BigInt(gross) + BigInt(fees.totalMinor)).toString(),
      };
    }
    this.state = { ...this.state, reservations };
  }

  private applyFill(
    current: Order,
    instrument: Instrument,
    rules: ReturnType<typeof getMarketRules>,
    price: string,
    quantity: number,
    at: ISOInstant,
  ): void {
    const priced = this.feeForNextFill(current, instrument, rules, price, quantity);
    const sequence = this.bumpSequence();
    const fillId = `fill-${padded(sequence)}`;
    const netCash = current.side === 'BUY'
      ? -(BigInt(priced.gross) + BigInt(priced.fees.totalMinor))
      : BigInt(priced.gross) - BigInt(priced.fees.totalMinor);
    const fill: Fill = {
      id: fillId,
      orderId: current.id,
      accountId: current.accountId,
      instrumentId: instrument.id,
      side: current.side,
      quantity,
      price,
      grossMinor: priced.gross,
      fees: priced.fees,
      netCashMinor: netCash.toString(),
      at,
      sequence,
    };
    this.state = { ...this.state, fills: [...this.state.fills, fill] };

    const filledQuantity = current.filledQuantity + quantity;
    const remainingQuantity = current.quantity - filledQuantity;
    const status: OrderStatus = remainingQuantity === 0 ? 'FILLED' : 'PARTIALLY_FILLED';
    const orderFills = this.state.fills
      .filter((row) => row.orderId === current.id)
      .map((row) => ({ price: row.price, quantity: row.quantity }));
    const order: Order = {
      ...current,
      filledQuantity,
      remainingQuantity,
      averageFillPrice: weightedAveragePrice(orderFills),
      status,
      updatedAt: at,
    };
    this.replaceOrder(order);

    const balance = this.state.account.cash[instrument.currency];
    const cash = {
      ...this.state.account.cash,
      [instrument.currency]: {
        ...balance,
        balanceMinor: (BigInt(balance.balanceMinor) + netCash).toString(),
      },
    };
    const tradeDate = marketDate(at, instrument.market);
    const positions = current.side === 'BUY'
      ? this.applyBuyToPositions(this.state.account.positions, instrument, fill, tradeDate, rules.sameDaySaleAllowed)
      : this.applySellToPositions(this.state.account.positions, instrument, fill, tradeDate);
    const realized = { ...this.state.account.realizedPnlMinorByCurrency };
    if (current.side === 'SELL') {
      const before = this.state.account.positions[instrument.id]?.realizedPnlMinor ?? '0';
      const after = positions[instrument.id]?.realizedPnlMinor ?? before;
      realized[instrument.currency] = (
        BigInt(realized[instrument.currency]) + BigInt(after) - BigInt(before)
      ).toString();
    }
    const account: Account = {
      ...this.state.account,
      cash,
      positions,
      realizedPnlMinorByCurrency: realized,
    };
    this.state = { ...this.state, account };
    this.updateReservationAfterFill(order, instrument, rules);
    this.refreshAccount(at, account);
    this.appendEvent(
      order,
      status === 'FILLED' ? 'FILLED' : 'PARTIALLY_FILLED',
      `${quantity} shares filled at ${price}.`,
      at,
      undefined,
      fillId,
    );
  }

  private applyBuyToPositions(
    positions: Account['positions'],
    instrument: Instrument,
    fill: Fill,
    tradeDate: ISODate,
    sameDaySaleAllowed: boolean,
  ): Readonly<Record<string, Position>> {
    const existing = positions[instrument.id] ?? {
      instrumentId: instrument.id,
      currency: instrument.currency,
      quantity: 0,
      settledQuantity: 0,
      availableQuantity: 0,
      averagePrice: '0',
      costBasisMinor: '0',
      realizedPnlMinor: '0',
      lots: [],
    } satisfies Position;
    const lotCost = (BigInt(fill.grossMinor) + BigInt(fill.fees.totalMinor)).toString();
    const lot: PositionLot = {
      id: `lot-${fill.id}`,
      quantity: fill.quantity,
      acquiredOn: tradeDate,
      sellableOn: sameDaySaleAllowed ? tradeDate : addBusinessDays(tradeDate, 1),
      costBasisMinor: lotCost,
    };
    const quantity = existing.quantity + fill.quantity;
    const costBasisMinor = (BigInt(existing.costBasisMinor) + BigInt(lotCost)).toString();
    return {
      ...positions,
      [instrument.id]: {
        ...existing,
        quantity,
        costBasisMinor,
        averagePrice: averagePriceFromMinor(costBasisMinor, quantity, instrument.currency),
        lots: [...existing.lots, lot],
      },
    };
  }

  private applySellToPositions(
    positions: Account['positions'],
    instrument: Instrument,
    fill: Fill,
    tradeDate: ISODate,
  ): Readonly<Record<string, Position>> {
    const existing = positions[instrument.id];
    if (!existing) throw new Error(`Position ${instrument.id} disappeared before fill.`);
    let remaining = fill.quantity;
    let removedCost = 0n;
    const lots: PositionLot[] = [];
    for (const lot of existing.lots) {
      if (remaining === 0 || lot.sellableOn > tradeDate) {
        lots.push(lot);
        continue;
      }
      const sold = Math.min(lot.quantity, remaining);
      const cost = sold === lot.quantity
        ? BigInt(lot.costBasisMinor)
        : divideRounded(BigInt(lot.costBasisMinor) * BigInt(sold), BigInt(lot.quantity), 'HALF_UP');
      removedCost += cost;
      remaining -= sold;
      if (sold < lot.quantity) {
        lots.push({
          ...lot,
          quantity: lot.quantity - sold,
          costBasisMinor: (BigInt(lot.costBasisMinor) - cost).toString(),
        });
      }
    }
    if (remaining !== 0) throw new Error('Sell fill exceeded the sellable FIFO position.');

    const quantity = existing.quantity - fill.quantity;
    const costBasisMinor = (BigInt(existing.costBasisMinor) - removedCost).toString();
    const realizedDelta = BigInt(fill.grossMinor) - BigInt(fill.fees.totalMinor) - removedCost;
    return {
      ...positions,
      [instrument.id]: {
        ...existing,
        quantity,
        settledQuantity: Math.max(0, existing.settledQuantity - fill.quantity),
        availableQuantity: Math.max(0, existing.availableQuantity - fill.quantity),
        costBasisMinor,
        averagePrice: quantity === 0
          ? '0'
          : averagePriceFromMinor(costBasisMinor, quantity, instrument.currency),
        realizedPnlMinor: (BigInt(existing.realizedPnlMinor) + realizedDelta).toString(),
        lots,
      },
    };
  }
}
