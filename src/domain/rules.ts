import type { Instrument, OrderType, TimeInForce } from './contracts';
import {
  compareDecimal,
  multiplyDecimalRatio,
  parseDecimal,
  quantizeToTick,
} from './exact';
import type { DecimalString, ISODate, ISOInstant, Market } from './primitives';

export type TickTableId =
  | 'US_NMS'
  | 'HKEX_CLASSIC'
  | 'HKEX_PHASE_1_2025'
  | 'HKEX_PHASE_2_2026'
  | 'CN_A_SHARE';
export type FeeScheduleId = 'US_RETAIL_2024' | 'HK_CASH_2023' | 'CN_CASH_2023';
export type SessionPhase = 'OPEN_AUCTION' | 'CONTINUOUS' | 'CLOSE_AUCTION' | 'CLOSED';

export interface SessionWindow {
  readonly phase: Exclude<SessionPhase, 'CLOSED'>;
  readonly start: string;
  readonly end: string;
  readonly acceptedOrderTypes: readonly OrderType[];
}

export interface MarketRuleSet {
  readonly id: string;
  readonly market: Market;
  readonly effectiveFrom: ISODate;
  readonly effectiveTo?: ISODate;
  readonly timeZone: string;
  readonly settlementBusinessDays: number;
  readonly sameDaySaleAllowed: boolean;
  readonly defaultBoardLot: number;
  readonly defaultMaxOrderQuantity: number;
  readonly tickTable: TickTableId;
  readonly feeSchedule: FeeScheduleId;
  readonly supportedTimeInForce: readonly TimeInForce[];
  readonly sessions: readonly SessionWindow[];
  readonly sourceNotes: readonly string[];
}

export interface SessionState {
  readonly marketDate: ISODate;
  readonly localTime: string;
  readonly phase: SessionPhase;
  readonly acceptedOrderTypes: readonly OrderType[];
  readonly isTradingDay: boolean;
}

export interface PriceLimitRange {
  readonly lower: DecimalString;
  readonly upper: DecimalString;
  readonly basisPoints: number;
}

const ALL_ORDER_TYPES: readonly OrderType[] = ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'];
const LIMIT_ORDERS: readonly OrderType[] = ['LIMIT'];

const US_SESSIONS: readonly SessionWindow[] = [
  { phase: 'CONTINUOUS', start: '09:30', end: '16:00', acceptedOrderTypes: ALL_ORDER_TYPES },
];

const HK_SESSIONS: readonly SessionWindow[] = [
  { phase: 'OPEN_AUCTION', start: '09:00', end: '09:30', acceptedOrderTypes: LIMIT_ORDERS },
  { phase: 'CONTINUOUS', start: '09:30', end: '12:00', acceptedOrderTypes: ALL_ORDER_TYPES },
  { phase: 'CONTINUOUS', start: '13:00', end: '16:00', acceptedOrderTypes: ALL_ORDER_TYPES },
  // HKEX closes at a randomized instant from 16:08 through 16:10. The simulator
  // accepts closing-auction limits until 16:10 and does not pretend to model the random cut-off.
  { phase: 'CLOSE_AUCTION', start: '16:00', end: '16:10', acceptedOrderTypes: LIMIT_ORDERS },
];

const CN_SESSIONS: readonly SessionWindow[] = [
  { phase: 'OPEN_AUCTION', start: '09:15', end: '09:25', acceptedOrderTypes: LIMIT_ORDERS },
  { phase: 'CONTINUOUS', start: '09:30', end: '11:30', acceptedOrderTypes: ALL_ORDER_TYPES },
  { phase: 'CONTINUOUS', start: '13:00', end: '14:57', acceptedOrderTypes: ALL_ORDER_TYPES },
  { phase: 'CLOSE_AUCTION', start: '14:57', end: '15:00', acceptedOrderTypes: LIMIT_ORDERS },
];

/**
 * Deliberately versioned instead of treating today's market structure as timeless.
 * Holiday calendars and exchange halts are supplied by an upstream market-calendar service;
 * this offline domain layer only excludes weekends.
 */
export const MARKET_RULE_HISTORY: Readonly<Record<Market, readonly MarketRuleSet[]>> = {
  US: [
    {
      id: 'US-NMS-T2-2023',
      market: 'US',
      effectiveFrom: '2023-01-01',
      effectiveTo: '2024-05-27',
      timeZone: 'America/New_York',
      settlementBusinessDays: 2,
      sameDaySaleAllowed: true,
      defaultBoardLot: 1,
      defaultMaxOrderQuantity: 1_000_000,
      tickTable: 'US_NMS',
      feeSchedule: 'US_RETAIL_2024',
      supportedTimeInForce: ['DAY', 'GTC'],
      sessions: US_SESSIONS,
      sourceNotes: [
        'SEC Regulation NMS regular session: 09:30-16:00 ET.',
        'Rule 612 standard quotation increment: USD 0.01 at or above USD 1 and USD 0.0001 below USD 1.',
      ],
    },
    {
      id: 'US-NMS-T1-2024',
      market: 'US',
      effectiveFrom: '2024-05-28',
      timeZone: 'America/New_York',
      settlementBusinessDays: 1,
      sameDaySaleAllowed: true,
      defaultBoardLot: 1,
      defaultMaxOrderQuantity: 1_000_000,
      tickTable: 'US_NMS',
      feeSchedule: 'US_RETAIL_2024',
      supportedTimeInForce: ['DAY', 'GTC'],
      sessions: US_SESSIONS,
      sourceNotes: [
        'US standard settlement moved to T+1 on 2024-05-28.',
        'SEC Regulation NMS regular session: 09:30-16:00 ET.',
      ],
    },
  ],
  HK: [
    {
      id: 'HKEX-CASH-2023',
      market: 'HK',
      effectiveFrom: '2023-01-01',
      effectiveTo: '2025-08-03',
      timeZone: 'Asia/Hong_Kong',
      settlementBusinessDays: 2,
      sameDaySaleAllowed: true,
      defaultBoardLot: 100,
      defaultMaxOrderQuantity: 3_000_000,
      tickTable: 'HKEX_CLASSIC',
      feeSchedule: 'HK_CASH_2023',
      supportedTimeInForce: ['DAY'],
      sessions: HK_SESSIONS,
      sourceNotes: ['HKEX issuer-specific board lots and classic spread table.'],
    },
    {
      id: 'HKEX-SPREAD-PHASE-1-2025',
      market: 'HK',
      effectiveFrom: '2025-08-04',
      effectiveTo: '2026-08-02',
      timeZone: 'Asia/Hong_Kong',
      settlementBusinessDays: 2,
      sameDaySaleAllowed: true,
      defaultBoardLot: 100,
      defaultMaxOrderQuantity: 3_000_000,
      tickTable: 'HKEX_PHASE_1_2025',
      feeSchedule: 'HK_CASH_2023',
      supportedTimeInForce: ['DAY'],
      sessions: HK_SESSIONS,
      sourceNotes: ['HKEX phase 1 spread reduction effective 2025-08-04: HKD 10-20 tick 0.01; HKD 20-50 tick 0.02.'],
    },
    {
      id: 'HKEX-SPREAD-PHASE-2-2026',
      market: 'HK',
      effectiveFrom: '2026-08-03',
      timeZone: 'Asia/Hong_Kong',
      settlementBusinessDays: 2,
      sameDaySaleAllowed: true,
      defaultBoardLot: 100,
      defaultMaxOrderQuantity: 3_000_000,
      tickTable: 'HKEX_PHASE_2_2026',
      feeSchedule: 'HK_CASH_2023',
      supportedTimeInForce: ['DAY'],
      sessions: HK_SESSIONS,
      sourceNotes: ['HKEX phase 2 spread reduction scheduled for 2026-08-03: HKD 0.50-10 tick 0.005.'],
    },
  ],
  CN: [
    {
      id: 'CN-A-SHARE-2023',
      market: 'CN',
      effectiveFrom: '2023-08-28',
      timeZone: 'Asia/Shanghai',
      settlementBusinessDays: 1,
      sameDaySaleAllowed: false,
      defaultBoardLot: 100,
      defaultMaxOrderQuantity: 1_000_000,
      tickTable: 'CN_A_SHARE',
      feeSchedule: 'CN_CASH_2023',
      supportedTimeInForce: ['DAY'],
      sessions: CN_SESSIONS,
      sourceNotes: [
        'SSE/SZSE A-share buy orders use 100-share lots; odd-lot liquidation is sell-only.',
        'A shares acquired on T are not saleable until T+1.',
        'Main-board default daily price limit is 10%; STAR and ChiNext default to 20%; ST instruments use 5%.',
      ],
    },
  ],
};

const MARKET_TIME_ZONES: Readonly<Record<Market, string>> = {
  US: 'America/New_York',
  HK: 'Asia/Hong_Kong',
  CN: 'Asia/Shanghai',
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  formatterCache.set(timeZone, created);
  return created;
}

function localDateTime(at: ISOInstant, timeZone: string): {
  date: ISODate;
  time: string;
  weekday: string;
} {
  const instant = new Date(at);
  if (Number.isNaN(instant.getTime())) throw new TypeError(`Invalid ISO instant: ${at}.`);
  const parts = formatter(timeZone).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
    weekday: value('weekday'),
  };
}

export function marketDate(at: ISOInstant, market: Market): ISODate {
  return localDateTime(at, MARKET_TIME_ZONES[market]).date;
}

export function getMarketRules(market: Market, at: ISOInstant | ISODate): MarketRuleSet {
  const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(at)
    ? at
    : localDateTime(at, MARKET_TIME_ZONES[market]).date;
  const history = MARKET_RULE_HISTORY[market];
  const match = [...history]
    .reverse()
    .find(
      (rules) =>
        rules.effectiveFrom <= effectiveDate && (!rules.effectiveTo || rules.effectiveTo >= effectiveDate),
    );
  if (!match) throw new RangeError(`No ${market} rules are configured for ${effectiveDate}.`);
  return match;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function getSessionState(rules: MarketRuleSet, at: ISOInstant): SessionState {
  const local = localDateTime(at, rules.timeZone);
  const isTradingDay = local.weekday !== 'Sat' && local.weekday !== 'Sun';
  if (!isTradingDay) {
    return {
      marketDate: local.date,
      localTime: local.time,
      phase: 'CLOSED',
      acceptedOrderTypes: [],
      isTradingDay: false,
    };
  }

  const minute = timeToMinutes(local.time);
  const window = rules.sessions.find(
    (candidate) => minute >= timeToMinutes(candidate.start) && minute < timeToMinutes(candidate.end),
  );
  return {
    marketDate: local.date,
    localTime: local.time,
    phase: window?.phase ?? 'CLOSED',
    acceptedOrderTypes: window?.acceptedOrderTypes ?? [],
    isTradingDay,
  };
}

interface TickBand {
  readonly through: DecimalString;
  readonly tick: DecimalString;
}

const HK_CLASSIC_BANDS: readonly TickBand[] = [
  { through: '0.25', tick: '0.001' },
  { through: '0.5', tick: '0.005' },
  { through: '10', tick: '0.01' },
  { through: '20', tick: '0.02' },
  { through: '100', tick: '0.05' },
  { through: '200', tick: '0.1' },
  { through: '500', tick: '0.2' },
  { through: '1000', tick: '0.5' },
  { through: '2000', tick: '1' },
  { through: '5000', tick: '2' },
  { through: '9995', tick: '5' },
];

const HK_PHASE_1_BANDS: readonly TickBand[] = [
  { through: '0.25', tick: '0.001' },
  { through: '0.5', tick: '0.005' },
  { through: '10', tick: '0.01' },
  { through: '20', tick: '0.01' },
  { through: '50', tick: '0.02' },
  { through: '100', tick: '0.05' },
  { through: '200', tick: '0.1' },
  { through: '500', tick: '0.2' },
  { through: '1000', tick: '0.5' },
  { through: '2000', tick: '1' },
  { through: '5000', tick: '2' },
  { through: '9995', tick: '5' },
];

const HK_PHASE_2_BANDS: readonly TickBand[] = [
  { through: '0.25', tick: '0.001' },
  { through: '0.5', tick: '0.005' },
  { through: '10', tick: '0.005' },
  ...HK_PHASE_1_BANDS.slice(3),
];

function hkTick(price: DecimalString, bands: readonly TickBand[]): DecimalString {
  const match = bands.find((band) => compareDecimal(price, band.through) <= 0);
  if (!match) throw new RangeError(`HKEX board-lot price ${price} is outside the supported spread table.`);
  return match.tick;
}

export function tickForPrice(
  instrument: Instrument,
  price: DecimalString,
  rules: MarketRuleSet,
): DecimalString {
  const parsed = parseDecimal(price);
  if (parsed.coefficient <= 0n) throw new RangeError('Price must be positive.');
  if (instrument.tickOverride) return instrument.tickOverride;

  switch (rules.tickTable) {
    case 'US_NMS':
      return compareDecimal(price, '1') < 0 ? '0.0001' : '0.01';
    case 'HKEX_CLASSIC':
      return hkTick(price, HK_CLASSIC_BANDS);
    case 'HKEX_PHASE_1_2025':
      return hkTick(price, HK_PHASE_1_BANDS);
    case 'HKEX_PHASE_2_2026':
      return hkTick(price, HK_PHASE_2_BANDS);
    case 'CN_A_SHARE':
      return instrument.assetClass === 'ETF' ? '0.001' : '0.01';
  }
}

export function instrumentPriceLimitBps(instrument: Instrument): number | null {
  if (instrument.priceLimitBps !== undefined) return instrument.priceLimitBps;
  if (instrument.market !== 'CN') return null;
  if (instrument.chinaBoard === 'STAR' || instrument.chinaBoard === 'CHINEXT') return 2_000;
  if (instrument.chinaBoard === 'ST') return 500;
  return 1_000;
}

export function priceLimitRange(
  instrument: Instrument,
  rules: MarketRuleSet,
): PriceLimitRange | null {
  const basisPoints = instrumentPriceLimitBps(instrument);
  if (basisPoints === null) return null;
  const tick = tickForPrice(instrument, instrument.previousClose, rules);
  const outputScale = Math.max(parseDecimal(instrument.previousClose).scale, parseDecimal(tick).scale) + 4;
  const lowerRaw = multiplyDecimalRatio(
    instrument.previousClose,
    BigInt(10_000 - basisPoints),
    10_000n,
    outputScale,
    'HALF_UP',
  );
  const upperRaw = multiplyDecimalRatio(
    instrument.previousClose,
    BigInt(10_000 + basisPoints),
    10_000n,
    outputScale,
    'HALF_UP',
  );
  return {
    lower: quantizeToTick(lowerRaw, tick, 'HALF_UP'),
    upper: quantizeToTick(upperRaw, tick, 'HALF_UP'),
    basisPoints,
  };
}

export function isWithinPriceLimits(
  price: DecimalString,
  instrument: Instrument,
  rules: MarketRuleSet,
): boolean {
  const range = priceLimitRange(instrument, rules);
  return !range || (compareDecimal(price, range.lower) >= 0 && compareDecimal(price, range.upper) <= 0);
}

/** Weekend-only business-day helper. Exchange holiday calendars remain an injected concern. */
export function addBusinessDays(date: ISODate, days: number): ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError(`Invalid ISO date: ${date}.`);
  if (!Number.isSafeInteger(days) || days < 0) throw new RangeError('Business days must be non-negative.');
  const cursor = new Date(`${date}T12:00:00.000Z`);
  let remaining = days;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return cursor.toISOString().slice(0, 10);
}
