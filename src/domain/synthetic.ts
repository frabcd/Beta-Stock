import type { Bar, Instrument, Quote } from './contracts';
import {
  addDecimal,
  compareDecimal,
  divideRounded,
  fromScaled,
  parseDecimal,
  quantizeToTick,
  subtractDecimal,
  toScaled,
} from './exact';
import type { DecimalString, ISOInstant } from './primitives';
import { getMarketRules, getSessionState, marketDate, tickForPrice } from './rules';

/** Small, fully specified integer PRNG for replayable fixtures and demos. */
export class DeterministicRandom {
  private state: number;

  public constructor(seed: string | number) {
    if (typeof seed === 'number') {
      if (!Number.isSafeInteger(seed)) throw new RangeError('Numeric seed must be a safe integer.');
      this.state = seed >>> 0;
    } else {
      let hash = 2_166_136_261;
      for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16_777_619);
      }
      this.state = hash >>> 0;
    }
    if (this.state === 0) this.state = 0x6d2b79f5;
  }

  public nextUint32(): number {
    // xorshift32; all transitions are explicit 32-bit integer operations.
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  public integer(minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) {
      throw new RangeError('Random integer bounds must be ordered safe integers.');
    }
    const span = maximum - minimum + 1;
    if (span <= 0 || span > 0x1_0000_0000) throw new RangeError('Random integer span is unsupported.');
    return minimum + (this.nextUint32() % span);
  }
}

export interface SyntheticBarOptions {
  readonly instrument: Instrument;
  readonly startTime: ISOInstant;
  readonly intervalMinutes: number;
  readonly count: number;
  readonly seed: string | number;
  readonly initialPrice?: DecimalString;
  readonly volatilityBps?: number;
  readonly baseVolume?: number;
  readonly tradingSessionsOnly?: boolean;
}

export interface SyntheticTickOptions {
  readonly instrument: Instrument;
  readonly startTime: ISOInstant;
  readonly intervalMs: number;
  readonly count: number;
  readonly seed: string | number;
  readonly initialPrice?: DecimalString;
  readonly volatilityBps?: number;
  readonly baseSize?: number;
  readonly tradingSessionsOnly?: boolean;
}

function assertGenerationOptions(count: number, interval: number): void {
  if (!Number.isSafeInteger(count) || count < 0 || count > 100_000) {
    throw new RangeError('Synthetic count must be an integer from 0 through 100,000.');
  }
  if (!Number.isSafeInteger(interval) || interval <= 0) {
    throw new RangeError('Synthetic interval must be a positive integer.');
  }
}

function moveByBasisPoints(
  price: DecimalString,
  basisPoints: number,
  instrument: Instrument,
  at: ISOInstant,
  rounding: 'DOWN' | 'UP' | 'HALF_UP' = 'HALF_UP',
): DecimalString {
  const rules = getMarketRules(instrument.market, at);
  const parsedPrice = parseDecimal(price);
  const referencePrice = compareDecimal(price, '0') > 0 ? price : '0.0001';
  const referenceTick = tickForPrice(instrument, referencePrice, rules);
  // A basis-point ratio contributes four decimal places. Keep those guard digits
  // beyond the market tick so a trimmed value such as "174" moves just as precisely
  // as "174.00" would. Serialized trailing zeroes must never become simulation state.
  const calculationScale = Math.min(
    24,
    Math.max(parsedPrice.scale, parseDecimal(referenceTick).scale + 4),
  );
  const rawUnits = divideRounded(
    toScaled(price, calculationScale) * BigInt(10_000 + basisPoints),
    10_000n,
    rounding,
  );
  const raw = fromScaled(rawUnits, calculationScale);
  const tick = tickForPrice(instrument, compareDecimal(raw, '0') > 0 ? raw : '0.0001', rules);
  const positive = compareDecimal(raw, tick) < 0 ? tick : raw;
  return quantizeToTick(positive, tick, rounding);
}

function nextTimestamp(
  candidateMs: number,
  instrument: Instrument,
  tradingSessionsOnly: boolean,
): number {
  if (!tradingSessionsOnly) return candidateMs;
  let cursor = candidateMs;
  // Eight calendar days covers a full weekend plus ordinary sessions. Holiday closure is
  // intentionally not guessed; callers with exchange calendars provide explicit timestamps.
  for (let index = 0; index < 8 * 24 * 60; index += 1) {
    const at = new Date(cursor).toISOString();
    const rules = getMarketRules(instrument.market, at);
    if (getSessionState(rules, at).phase === 'CONTINUOUS') return cursor;
    cursor += 60_000;
  }
  throw new RangeError('Could not find a continuous session within eight days.');
}

export function generateSyntheticBars(options: SyntheticBarOptions): readonly Bar[] {
  assertGenerationOptions(options.count, options.intervalMinutes);
  const start = new Date(options.startTime).getTime();
  if (!Number.isFinite(start)) throw new TypeError(`Invalid startTime ${options.startTime}.`);
  const random = new DeterministicRandom(options.seed);
  const volatility = options.volatilityBps ?? 35;
  const baseVolume = options.baseVolume ?? 250_000;
  if (!Number.isSafeInteger(volatility) || volatility < 0 || volatility > 5_000) {
    throw new RangeError('volatilityBps must be an integer from 0 through 5,000.');
  }
  if (!Number.isSafeInteger(baseVolume) || baseVolume <= 0) throw new RangeError('Invalid baseVolume.');

  const rows: Bar[] = [];
  let cursor = nextTimestamp(start, options.instrument, options.tradingSessionsOnly ?? true);
  let current = options.initialPrice ?? options.instrument.previousClose;
  for (let index = 0; index < options.count; index += 1) {
    cursor = nextTimestamp(cursor, options.instrument, options.tradingSessionsOnly ?? true);
    const at = new Date(cursor).toISOString();
    const open = current;
    const close = moveByBasisPoints(
      open,
      random.integer(-volatility, volatility),
      options.instrument,
      at,
    );
    const greater = compareDecimal(open, close) >= 0 ? open : close;
    const lesser = compareDecimal(open, close) <= 0 ? open : close;
    const wickLimit = Math.max(1, Math.floor(volatility / 2));
    const high = moveByBasisPoints(
      greater,
      random.integer(0, wickLimit),
      options.instrument,
      at,
      'UP',
    );
    const low = moveByBasisPoints(
      lesser,
      -random.integer(0, wickLimit),
      options.instrument,
      at,
      'DOWN',
    );
    const end = cursor + options.intervalMinutes * 60_000;
    rows.push({
      instrumentId: options.instrument.id,
      start: at,
      end: new Date(end).toISOString(),
      intervalMinutes: options.intervalMinutes,
      open,
      high,
      low,
      close,
      volume: Math.max(1, baseVolume + random.integer(-Math.floor(baseVolume / 2), baseVolume)),
    });
    current = close;
    cursor = end;
  }
  return rows;
}

export function generateSyntheticTicks(options: SyntheticTickOptions): readonly Quote[] {
  assertGenerationOptions(options.count, options.intervalMs);
  const start = new Date(options.startTime).getTime();
  if (!Number.isFinite(start)) throw new TypeError(`Invalid startTime ${options.startTime}.`);
  const random = new DeterministicRandom(options.seed);
  const volatility = options.volatilityBps ?? 8;
  const baseSize = options.baseSize ?? Math.max(1, options.instrument.boardLot * 10);
  if (!Number.isSafeInteger(volatility) || volatility < 0 || volatility > 1_000) {
    throw new RangeError('volatilityBps must be an integer from 0 through 1,000.');
  }
  if (!Number.isSafeInteger(baseSize) || baseSize <= 0) throw new RangeError('Invalid baseSize.');

  const rows: Quote[] = [];
  let cursor = nextTimestamp(start, options.instrument, options.tradingSessionsOnly ?? true);
  let last = options.initialPrice ?? options.instrument.previousClose;
  let open = last;
  let high = last;
  let low = last;
  let cumulativeVolume = 0;
  for (let index = 0; index < options.count; index += 1) {
    cursor = nextTimestamp(cursor, options.instrument, options.tradingSessionsOnly ?? true);
    const at = new Date(cursor).toISOString();
    last = moveByBasisPoints(
      last,
      random.integer(-volatility, volatility),
      options.instrument,
      at,
    );
    if (index === 0) open = last;
    if (compareDecimal(last, high) > 0) high = last;
    if (compareDecimal(last, low) < 0) low = last;
    const rules = getMarketRules(options.instrument.market, at);
    const tick = tickForPrice(options.instrument, last, rules);
    const bid = compareDecimal(last, tick) > 0 ? subtractDecimal(last, tick) : last;
    const ask = addDecimal(last, tick);
    const tradeSize = Math.max(1, baseSize + random.integer(-Math.floor(baseSize / 2), baseSize));
    cumulativeVolume += tradeSize;
    rows.push({
      instrumentId: options.instrument.id,
      at,
      tradingDate: marketDate(at, options.instrument.market),
      bid,
      ask,
      last,
      open,
      high,
      low,
      previousClose: options.instrument.previousClose,
      bidSize: Math.max(1, baseSize + random.integer(-Math.floor(baseSize / 2), baseSize)),
      askSize: Math.max(1, baseSize + random.integer(-Math.floor(baseSize / 2), baseSize)),
      cumulativeVolume,
      sequence: index + 1,
    });
    cursor += options.intervalMs;
  }
  return rows;
}
