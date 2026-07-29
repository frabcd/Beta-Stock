import {
  CURRENCY_DECIMALS,
  type Currency,
  type DecimalString,
  type MinorUnitString,
} from './primitives';

export type RoundingMode = 'DOWN' | 'UP' | 'HALF_UP';

export interface ParsedDecimal {
  readonly coefficient: bigint;
  readonly scale: number;
}

const DECIMAL_PATTERN = /^[+-]?(?:\d+)(?:\.\d+)?$/;
const INTEGER_PATTERN = /^[+-]?\d+$/;
const POWERS_OF_TEN: bigint[] = [1n];

function pow10(scale: number): bigint {
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > 24) {
    throw new RangeError(`Decimal scale must be an integer between 0 and 24; received ${scale}.`);
  }
  while (POWERS_OF_TEN.length <= scale) {
    POWERS_OF_TEN.push(POWERS_OF_TEN[POWERS_OF_TEN.length - 1] * 10n);
  }
  return POWERS_OF_TEN[scale];
}

export function parseDecimal(value: DecimalString): ParsedDecimal {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value.trim())) {
    throw new TypeError(`Expected a plain decimal string; received ${String(value)}.`);
  }

  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = trimmed.replace(/^[+-]/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  const coefficient = BigInt(digits || '0') * (negative ? -1n : 1n);
  return { coefficient, scale: fraction.length };
}

export function decimal(value: DecimalString): DecimalString {
  const parsed = parseDecimal(value);
  return fromScaled(parsed.coefficient, parsed.scale);
}

export function minor(value: MinorUnitString): MinorUnitString {
  if (typeof value !== 'string' || !INTEGER_PATTERN.test(value.trim())) {
    throw new TypeError(`Expected an integer minor-unit string; received ${String(value)}.`);
  }
  return BigInt(value.trim()).toString();
}

export function fromScaled(coefficient: bigint, scale: number, trim = true): DecimalString {
  const divisor = pow10(scale);
  const negative = coefficient < 0n;
  const absolute = negative ? -coefficient : coefficient;
  const whole = absolute / divisor;
  if (scale === 0) return `${negative ? '-' : ''}${whole.toString()}`;

  let fraction = (absolute % divisor).toString().padStart(scale, '0');
  if (trim) fraction = fraction.replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${fraction ? `.${fraction}` : ''}`;
}

export function divideRounded(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode = 'HALF_UP',
): bigint {
  if (denominator === 0n) throw new RangeError('Cannot divide by zero.');
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  let quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;

  if (remainder !== 0n) {
    if (mode === 'UP') quotient += 1n;
    if (mode === 'HALF_UP' && remainder * 2n >= absoluteDenominator) quotient += 1n;
  }
  return negative ? -quotient : quotient;
}

export function toScaled(
  value: DecimalString,
  targetScale: number,
  rounding: RoundingMode = 'HALF_UP',
): bigint {
  const parsed = parseDecimal(value);
  if (parsed.scale === targetScale) return parsed.coefficient;
  if (parsed.scale < targetScale) {
    return parsed.coefficient * pow10(targetScale - parsed.scale);
  }
  return divideRounded(parsed.coefficient, pow10(parsed.scale - targetScale), rounding);
}

export function compareDecimal(left: DecimalString, right: DecimalString): -1 | 0 | 1 {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  const scale = Math.max(a.scale, b.scale);
  const aValue = a.coefficient * pow10(scale - a.scale);
  const bValue = b.coefficient * pow10(scale - b.scale);
  return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
}

export function addDecimal(left: DecimalString, right: DecimalString): DecimalString {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  const scale = Math.max(a.scale, b.scale);
  return fromScaled(
    a.coefficient * pow10(scale - a.scale) + b.coefficient * pow10(scale - b.scale),
    scale,
  );
}

export function subtractDecimal(left: DecimalString, right: DecimalString): DecimalString {
  const b = parseDecimal(right);
  return addDecimal(left, fromScaled(-b.coefficient, b.scale));
}

export function multiplyDecimalByInteger(value: DecimalString, multiplier: number): DecimalString {
  if (!Number.isSafeInteger(multiplier)) throw new RangeError('Multiplier must be a safe integer.');
  const parsed = parseDecimal(value);
  return fromScaled(parsed.coefficient * BigInt(multiplier), parsed.scale);
}

export function multiplyDecimalRatio(
  value: DecimalString,
  numerator: bigint,
  denominator: bigint,
  outputScale: number,
  rounding: RoundingMode = 'HALF_UP',
): DecimalString {
  const parsed = parseDecimal(value);
  const scaledNumerator = parsed.coefficient * numerator * pow10(outputScale);
  const scaledDenominator = denominator * pow10(parsed.scale);
  return fromScaled(divideRounded(scaledNumerator, scaledDenominator, rounding), outputScale);
}

export function isTickAligned(value: DecimalString, tick: DecimalString): boolean {
  const price = parseDecimal(value);
  const increment = parseDecimal(tick);
  if (increment.coefficient <= 0n) throw new RangeError('Tick size must be positive.');
  const scale = Math.max(price.scale, increment.scale);
  const priceUnits = price.coefficient * pow10(scale - price.scale);
  const tickUnits = increment.coefficient * pow10(scale - increment.scale);
  return priceUnits % tickUnits === 0n;
}

export function quantizeToTick(
  value: DecimalString,
  tick: DecimalString,
  rounding: RoundingMode = 'HALF_UP',
): DecimalString {
  const price = parseDecimal(value);
  const increment = parseDecimal(tick);
  if (increment.coefficient <= 0n) throw new RangeError('Tick size must be positive.');
  const scale = Math.max(price.scale, increment.scale);
  const priceUnits = price.coefficient * pow10(scale - price.scale);
  const tickUnits = increment.coefficient * pow10(scale - increment.scale);
  const tickCount = divideRounded(priceUnits, tickUnits, rounding);
  return fromScaled(tickCount * tickUnits, scale);
}

export function grossMinor(
  price: DecimalString,
  quantity: number,
  currency: Currency,
  rounding: RoundingMode = 'HALF_UP',
): MinorUnitString {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError('Quantity must be a non-negative safe integer.');
  }
  const parsed = parseDecimal(price);
  const currencyScale = CURRENCY_DECIMALS[currency];
  const numerator = parsed.coefficient * BigInt(quantity) * pow10(currencyScale);
  return divideRounded(numerator, pow10(parsed.scale), rounding).toString();
}

export function rateMinor(
  amountMinor: MinorUnitString,
  numerator: bigint,
  denominator: bigint,
  rounding: RoundingMode = 'HALF_UP',
): MinorUnitString {
  return divideRounded(BigInt(minor(amountMinor)) * numerator, denominator, rounding).toString();
}

export function roundMinorToIncrement(
  amountMinor: MinorUnitString,
  incrementMinor: bigint,
  rounding: RoundingMode,
): MinorUnitString {
  if (incrementMinor <= 0n) throw new RangeError('Minor-unit increment must be positive.');
  return (divideRounded(BigInt(minor(amountMinor)), incrementMinor, rounding) * incrementMinor).toString();
}

export function sumMinor(values: readonly MinorUnitString[]): MinorUnitString {
  return values.reduce<bigint>((total, value) => total + BigInt(minor(value)), 0n).toString();
}

export function minMinor(left: MinorUnitString, right: MinorUnitString): MinorUnitString {
  return (BigInt(minor(left)) <= BigInt(minor(right)) ? BigInt(left) : BigInt(right)).toString();
}

export function formatMinor(amountMinor: MinorUnitString, currency: Currency): DecimalString {
  return fromScaled(BigInt(minor(amountMinor)), CURRENCY_DECIMALS[currency], false);
}

export function averagePriceFromMinor(
  costMinor: MinorUnitString,
  quantity: number,
  currency: Currency,
  priceScale = 4,
): DecimalString {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new RangeError('Invalid quantity.');
  if (quantity === 0) return '0';
  const numerator = BigInt(minor(costMinor)) * pow10(priceScale);
  const denominator = BigInt(quantity) * pow10(CURRENCY_DECIMALS[currency]);
  return fromScaled(divideRounded(numerator, denominator, 'HALF_UP'), priceScale);
}

export function weightedAveragePrice(
  rows: readonly { readonly price: DecimalString; readonly quantity: number }[],
): DecimalString | undefined {
  const totalQuantity = rows.reduce((total, row) => total + row.quantity, 0);
  if (totalQuantity === 0) return undefined;
  // A weighted mean can require more decimal places than any individual execution price.
  // Four guard digits preserve sub-tick averages while remaining a compact display value.
  const scale = Math.min(24, Math.max(0, ...rows.map((row) => parseDecimal(row.price).scale)) + 4);
  const weighted = rows.reduce<bigint>(
    (total, row) => total + toScaled(row.price, scale) * BigInt(row.quantity),
    0n,
  );
  return fromScaled(divideRounded(weighted, BigInt(totalQuantity), 'HALF_UP'), scale);
}
