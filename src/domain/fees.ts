import type {
  FeeBreakdown,
  FeeComponent,
  Instrument,
  OrderSide,
} from './contracts';
import {
  divideRounded,
  grossMinor,
  minor,
  rateMinor,
  roundMinorToIncrement,
  sumMinor,
} from './exact';
import type { DecimalString, MinorUnitString } from './primitives';
import type { MarketRuleSet } from './rules';

export interface FeeEstimateInput {
  readonly instrument: Instrument;
  readonly rules: MarketRuleSet;
  readonly side: OrderSide;
  readonly price: DecimalString;
  readonly quantity: number;
}

export interface GrossFeeEstimateInput {
  readonly instrument: Instrument;
  readonly rules: MarketRuleSet;
  readonly side: OrderSide;
  readonly grossMinor: MinorUnitString;
  readonly quantity: number;
}

function component(
  code: FeeComponent['code'],
  label: string,
  amountMinor: MinorUnitString,
): FeeComponent {
  return { code, label, amountMinor: minor(amountMinor) };
}

function atLeast(value: MinorUnitString, minimum: bigint): MinorUnitString {
  const parsed = BigInt(minor(value));
  return (parsed < minimum ? minimum : parsed).toString();
}

function usFees(input: GrossFeeEstimateInput): readonly FeeComponent[] {
  if (input.side === 'BUY') return [];
  // Versioned illustrative US retail regulatory schedule. Brokerage commission is zero.
  // Section 31: USD 27.80 per USD 1,000,000; FINRA TAF: USD 0.000166/share,
  // constrained here to the published USD 0.01 minimum and USD 8.30 maximum.
  const section31 = rateMinor(input.grossMinor, 278n, 10_000_000n, 'UP');
  const tafUncapped = divideRounded(BigInt(input.quantity) * 166n, 10_000n, 'UP');
  const taf = (tafUncapped < 1n ? 1n : tafUncapped > 830n ? 830n : tafUncapped).toString();
  return [
    component('SEC_SECTION_31', 'SEC Section 31 fee', section31),
    component('FINRA_TAF', 'FINRA trading activity fee', taf),
  ];
}

function hkFees(input: GrossFeeEstimateInput): readonly FeeComponent[] {
  // Brokerage is explicitly a simulator profile, not an exchange-mandated rate.
  const brokerage = atLeast(rateMinor(input.grossMinor, 3n, 10_000n, 'HALF_UP'), 300n);
  const stampRaw = rateMinor(input.grossMinor, 1n, 1_000n, 'UP');
  const stampDuty = roundMinorToIncrement(stampRaw, 100n, 'UP');
  return [
    component('BROKER_COMMISSION', 'Simulated broker commission', brokerage),
    component('HK_STAMP_DUTY', 'Hong Kong stamp duty', stampDuty),
    component('SFC_LEVY', 'SFC transaction levy', rateMinor(input.grossMinor, 27n, 1_000_000n)),
    component('AFRC_LEVY', 'AFRC transaction levy', rateMinor(input.grossMinor, 15n, 10_000_000n)),
    component(
      'HKEX_TRADING_FEE',
      'HKEX trading fee',
      rateMinor(input.grossMinor, 565n, 10_000_000n),
    ),
  ];
}

function cnFees(input: GrossFeeEstimateInput): readonly FeeComponent[] {
  // Common retail commission profile (0.025%, CNY 5 minimum) plus statutory estimates.
  const brokerage = atLeast(rateMinor(input.grossMinor, 25n, 100_000n), 500n);
  const components: FeeComponent[] = [
    component('BROKER_COMMISSION', 'Simulated broker commission', brokerage),
    component('CN_TRANSFER_FEE', 'A-share transfer fee', rateMinor(input.grossMinor, 1n, 100_000n)),
  ];
  if (input.side === 'SELL') {
    components.push(
      component('CN_STAMP_DUTY', 'Mainland stamp duty', rateMinor(input.grossMinor, 5n, 10_000n)),
    );
  }
  return components;
}

export function estimateFeesFromGross(input: GrossFeeEstimateInput): FeeBreakdown {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw new RangeError('Fee quantity must be a positive safe integer.');
  }
  const gross = BigInt(minor(input.grossMinor));
  if (gross <= 0n) throw new RangeError('Fee gross consideration must be positive.');

  let components: readonly FeeComponent[];
  switch (input.rules.feeSchedule) {
    case 'US_RETAIL_2024':
      components = usFees(input);
      break;
    case 'HK_CASH_2023':
      components = hkFees(input);
      break;
    case 'CN_CASH_2023':
      components = cnFees(input);
      break;
  }
  return {
    currency: input.instrument.currency,
    components,
    totalMinor: sumMinor(components.map((item) => item.amountMinor)),
  };
}

export function estimateFees(input: FeeEstimateInput): FeeBreakdown {
  return estimateFeesFromGross({
    instrument: input.instrument,
    rules: input.rules,
    side: input.side,
    grossMinor: grossMinor(input.price, input.quantity, input.instrument.currency),
    quantity: input.quantity,
  });
}

/**
 * Returns only the additional fee caused by a new partial fill. This makes fee minima and
 * transaction-level rounding deterministic across any number of fills instead of charging a
 * minimum commission once per fill.
 */
export function incrementalFees(
  previous: GrossFeeEstimateInput | null,
  cumulative: GrossFeeEstimateInput,
): FeeBreakdown {
  const before = previous
    ? estimateFeesFromGross(previous)
    : { currency: cumulative.instrument.currency, components: [], totalMinor: '0' } as FeeBreakdown;
  const after = estimateFeesFromGross(cumulative);
  const beforeByCode = new Map(before.components.map((item) => [item.code, BigInt(item.amountMinor)]));
  const components = after.components
    .map((item) => ({
      ...item,
      amountMinor: (BigInt(item.amountMinor) - (beforeByCode.get(item.code) ?? 0n)).toString(),
    }))
    .filter((item) => BigInt(item.amountMinor) !== 0n);
  return {
    currency: after.currency,
    components,
    totalMinor: sumMinor(components.map((item) => item.amountMinor)),
  };
}
