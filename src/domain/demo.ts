import type { Account, Bar, CashBalance, Instrument, Position, Quote } from './contracts';
import { averagePriceFromMinor } from './exact';
import type { Currency, ISOInstant, MinorUnitString } from './primitives';
import { generateSyntheticBars, generateSyntheticTicks } from './synthetic';

export const DEMO_INSTRUMENTS: readonly Instrument[] = [
  {
    id: 'us-aapl', symbol: 'AAPL', displaySymbol: 'AAPL', name: 'Apple Inc.', shortName: 'Apple',
    market: 'US', exchange: 'NASDAQ', currency: 'USD', assetClass: 'EQUITY',
    timeZone: 'America/New_York', boardLot: 1, active: true, previousClose: '213.88',
    sector: 'Technology', logoText: 'A',
  },
  {
    id: 'us-nvda', symbol: 'NVDA', displaySymbol: 'NVDA', name: 'NVIDIA Corporation', shortName: 'NVIDIA',
    market: 'US', exchange: 'NASDAQ', currency: 'USD', assetClass: 'EQUITY',
    timeZone: 'America/New_York', boardLot: 1, active: true, previousClose: '171.37',
    sector: 'Semiconductors', logoText: 'N',
  },
  {
    id: 'hk-00700', symbol: '00700', displaySymbol: '0700.HK', name: 'Tencent Holdings Limited', shortName: 'Tencent',
    market: 'HK', exchange: 'HKEX', currency: 'HKD', assetClass: 'EQUITY',
    timeZone: 'Asia/Hong_Kong', boardLot: 100, active: true, previousClose: '552.5',
    sector: 'Interactive Media', logoText: 'T',
  },
  {
    id: 'hk-09988', symbol: '09988', displaySymbol: '9988.HK', name: 'Alibaba Group Holding Limited', shortName: 'Alibaba',
    market: 'HK', exchange: 'HKEX', currency: 'HKD', assetClass: 'EQUITY',
    timeZone: 'Asia/Hong_Kong', boardLot: 100, active: true, previousClose: '118.7',
    sector: 'Consumer Internet', logoText: 'A',
  },
  {
    id: 'cn-600519', symbol: '600519', displaySymbol: '600519.SH', name: 'Kweichow Moutai Co., Ltd.', shortName: 'Kweichow Moutai',
    market: 'CN', exchange: 'SSE', currency: 'CNY', assetClass: 'EQUITY', chinaBoard: 'MAIN',
    timeZone: 'Asia/Shanghai', boardLot: 100, active: true, previousClose: '1428.56',
    sector: 'Consumer Staples', logoText: 'M',
  },
  {
    id: 'cn-300750', symbol: '300750', displaySymbol: '300750.SZ', name: 'Contemporary Amperex Technology Co., Ltd.', shortName: 'CATL',
    market: 'CN', exchange: 'SZSE', currency: 'CNY', assetClass: 'EQUITY', chinaBoard: 'CHINEXT',
    timeZone: 'Asia/Shanghai', boardLot: 100, maxOrderQuantity: 300_000, active: true,
    previousClose: '284.32', sector: 'Battery Technology', logoText: 'C',
  },
];

function cash(currency: Currency, balanceMinor: MinorUnitString): CashBalance {
  return { currency, balanceMinor, reservedMinor: '0', buyingPowerMinor: balanceMinor };
}

function seededPosition(
  instrument: Instrument,
  quantity: number,
  costBasisMinor: MinorUnitString,
  acquiredOn: string,
): Position {
  return {
    instrumentId: instrument.id,
    currency: instrument.currency,
    quantity,
    settledQuantity: quantity,
    availableQuantity: quantity,
    averagePrice: averagePriceFromMinor(costBasisMinor, quantity, instrument.currency),
    costBasisMinor,
    realizedPnlMinor: '0',
    lots: [{
      id: `demo-lot-${instrument.id}`,
      quantity,
      acquiredOn,
      sellableOn: acquiredOn,
      costBasisMinor,
    }],
  };
}

export function createDemoAccount(): Account {
  const apple = DEMO_INSTRUMENTS.find((item) => item.id === 'us-aapl')!;
  const tencent = DEMO_INSTRUMENTS.find((item) => item.id === 'hk-00700')!;
  const moutai = DEMO_INSTRUMENTS.find((item) => item.id === 'cn-600519')!;
  const positions = [
    seededPosition(apple, 40, '741000', '2026-07-22'),
    seededPosition(tencent, 200, '7600000', '2026-07-22'),
    seededPosition(moutai, 100, '14500000', '2026-07-22'),
  ];
  return {
    id: 'demo-account',
    name: 'Beta Global Paper Portfolio',
    baseCurrency: 'USD',
    cash: {
      USD: cash('USD', '25000000'),
      HKD: cash('HKD', '500000000'),
      CNY: cash('CNY', '300000000'),
    },
    positions: Object.fromEntries(positions.map((position) => [position.instrumentId, position])),
    realizedPnlMinorByCurrency: { USD: '0', HKD: '0', CNY: '0' },
    version: 1,
  };
}

export interface DemoEnvironmentOptions {
  /** Any string gives the same replay on every JS runtime implementing 32-bit integer ops. */
  readonly seed?: string;
  /** Required behavior is explicit: no Date.now() is consulted anywhere in the demo domain. */
  readonly asOf?: ISOInstant;
  readonly barCount?: number;
}

export interface DemoEnvironment {
  readonly seed: string;
  readonly asOf: ISOInstant;
  readonly instruments: readonly Instrument[];
  readonly account: Account;
  readonly quotes: Readonly<Record<string, Quote>>;
  readonly bars: Readonly<Record<string, readonly Bar[]>>;
}

export function createDemoEnvironment(options: DemoEnvironmentOptions = {}): DemoEnvironment {
  const seed = options.seed ?? 'beta-stock-market-quality-v1';
  const asOf = options.asOf ?? '2026-07-27T02:00:00.000Z';
  const asOfMs = new Date(asOf).getTime();
  if (!Number.isFinite(asOfMs)) throw new TypeError(`Invalid asOf instant ${asOf}.`);
  const barCount = options.barCount ?? 80;
  if (!Number.isSafeInteger(barCount) || barCount < 0 || barCount > 10_000) {
    throw new RangeError('barCount must be an integer from 0 through 10,000.');
  }
  const historyStart = new Date(asOfMs - 14 * 24 * 60 * 60 * 1_000).toISOString();

  const quotes = Object.fromEntries(
    DEMO_INSTRUMENTS.map((instrument) => {
      const quote = generateSyntheticTicks({
        instrument,
        startTime: asOf,
        intervalMs: 1_000,
        count: 1,
        seed: `${seed}:${instrument.id}:quote`,
        initialPrice: instrument.previousClose,
        baseSize: instrument.boardLot * 12,
        tradingSessionsOnly: false,
      })[0];
      return [instrument.id, quote];
    }),
  );
  const bars = Object.fromEntries(
    DEMO_INSTRUMENTS.map((instrument) => [instrument.id, generateSyntheticBars({
      instrument,
      startTime: historyStart,
      intervalMinutes: 30,
      count: barCount,
      seed: `${seed}:${instrument.id}:bars`,
      initialPrice: instrument.previousClose,
      baseVolume: instrument.market === 'US' ? 750_000 : 300_000,
      tradingSessionsOnly: true,
    })]),
  );

  return {
    seed,
    asOf,
    instruments: DEMO_INSTRUMENTS,
    account: createDemoAccount(),
    quotes,
    bars,
  };
}
