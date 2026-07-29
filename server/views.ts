import type {
  Bar,
  Instrument,
  Order,
  Quote,
  SimulationState,
} from '../src/domain/contracts';
import { grossMinor } from '../src/domain/exact';
import type { Market } from '../src/domain/primitives';
import { syntheticProvenance } from './provenance';

const instrumentVisuals: Readonly<Record<string, { color: string; marketCap: string }>> = {
  'us-aapl': { color: '#aab8d5', marketCap: '3.19T' },
  'us-nvda': { color: '#83a8ff', marketCap: '4.31T' },
  'hk-00700': { color: '#56c5a8', marketCap: '5.09T' },
  'hk-09988': { color: '#f09a6d', marketCap: '2.26T' },
  'cn-600519': { color: '#d8ae6f', marketCap: '1.83T' },
  'cn-300750': { color: '#62bfa8', marketCap: '1.26T' },
};

const fixedFxToUsd: Readonly<Record<string, number>> = {
  USD: 1,
  HKD: 0.1279,
  CNY: 0.1394,
};

function compactVolume(value: number): string {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function marketPriceChange(quote: Quote): { change: number; changePct: number } {
  const change = Number(quote.last) - Number(quote.previousClose);
  return {
    change: Number(change.toFixed(4)),
    changePct: Number(((change / Number(quote.previousClose)) * 100).toFixed(2)),
  };
}

export function findInstrument(instruments: readonly Instrument[], candidate: string): Instrument | undefined {
  const normalized = candidate.trim().toUpperCase();
  const bare = normalized.replace(/\.(HK|SH|SZ)$/, '');
  return instruments.find((instrument) => {
    const candidates = [instrument.id, instrument.symbol, instrument.displaySymbol]
      .map((value) => value.toUpperCase());
    if (candidates.includes(normalized)) return true;
    if (instrument.market === 'HK' && /^\d+$/.test(bare)) {
      return Number(instrument.symbol) === Number(bare);
    }
    return instrument.symbol === bare;
  });
}

export function equityView(
  instrument: Instrument,
  quote: Quote,
  bars: readonly Bar[],
  now: Date,
): Record<string, unknown> {
  const change = marketPriceChange(quote);
  return {
    id: instrument.id,
    instrumentId: instrument.id,
    symbol: instrument.market === 'HK' ? instrument.symbol.replace(/^0+/, '').padStart(4, '0') : instrument.symbol,
    displaySymbol: instrument.displaySymbol,
    name: instrument.shortName,
    legalName: instrument.name,
    region: instrument.market,
    market: instrument.market,
    exchange: instrument.exchange,
    currency: instrument.currency,
    price: Number(quote.last),
    priceExact: quote.last,
    previousCloseExact: quote.previousClose,
    ...change,
    volume: compactVolume(quote.cumulativeVolume),
    volumeExact: quote.cumulativeVolume,
    marketCap: instrumentVisuals[instrument.id]?.marketCap ?? 'SYNTHETIC',
    sector: instrument.sector,
    spark: bars.slice(-42).map((bar) => Number(bar.close)),
    color: instrumentVisuals[instrument.id]?.color ?? '#83a8ff',
    boardLot: instrument.boardLot,
    assetClass: instrument.assetClass,
    quote,
    provenance: syntheticProvenance(now),
  };
}

export function orderView(order: Order, instruments: readonly Instrument[]): Record<string, unknown> {
  const instrument = instruments.find((item) => item.id === order.instrumentId);
  const displayStatus: Readonly<Record<Order['status'], string>> = {
    PENDING_VALIDATION: 'Validating',
    ACCEPTED: 'Working',
    TRIGGERED: 'Triggered',
    PARTIALLY_FILLED: 'Partially filled',
    FILLED: 'Filled',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
  };
  return {
    ...order,
    symbol: instrument?.market === 'HK'
      ? instrument.symbol.replace(/^0+/, '').padStart(4, '0')
      : instrument?.symbol ?? order.instrumentId,
    displaySymbol: instrument?.displaySymbol ?? order.instrumentId,
    market: instrument?.market,
    currency: instrument?.currency,
    time: order.submittedAt.slice(11, 19),
    displaySide: order.side === 'BUY' ? 'Buy' : 'Sell',
    displayType: order.type.toLowerCase().replace('_', ' ').replace(/^./, (value) => value.toUpperCase()),
    filled: order.filledQuantity,
    price: Number(order.averageFillPrice ?? order.limitPrice ?? order.stopPrice ?? '0'),
    displayStatus: displayStatus[order.status],
  };
}

export function portfolioView(
  state: SimulationState,
  instruments: readonly Instrument[],
  quotes: Readonly<Record<string, Quote>>,
  now: Date,
): Record<string, unknown> {
  let equityUsd = 0;
  let buyingPowerUsd = 0;
  const cash = Object.values(state.account.cash).map((balance) => {
    const fx = fixedFxToUsd[balance.currency] ?? 0;
    equityUsd += Number(balance.balanceMinor) / 100 * fx;
    buyingPowerUsd += Number(balance.buyingPowerMinor) / 100 * fx;
    return balance;
  });
  const positions = Object.values(state.account.positions).map((position) => {
    const instrument = instruments.find((item) => item.id === position.instrumentId);
    const quote = quotes[position.instrumentId];
    const last = quote?.last ?? position.averagePrice;
    const previousClose = quote?.previousClose ?? last;
    const marketValueMinor = grossMinor(last, position.quantity, position.currency);
    const previousValueMinor = grossMinor(previousClose, position.quantity, position.currency);
    const pnlMinor = (BigInt(marketValueMinor) - BigInt(position.costBasisMinor)).toString();
    const dayMinor = (BigInt(marketValueMinor) - BigInt(previousValueMinor)).toString();
    const fx = fixedFxToUsd[position.currency] ?? 0;
    equityUsd += Number(marketValueMinor) / 100 * fx;
    const cost = Number(position.costBasisMinor) / 100;
    const pnlLocal = Number(pnlMinor) / 100;
    const dayLocal = Number(dayMinor) / 100;
    return {
      ...position,
      symbol: instrument?.market === 'HK'
        ? instrument.symbol.replace(/^0+/, '').padStart(4, '0')
        : instrument?.symbol ?? position.instrumentId,
      displaySymbol: instrument?.displaySymbol ?? position.instrumentId,
      name: instrument?.shortName ?? position.instrumentId,
      region: instrument?.market ?? 'US',
      shares: position.quantity,
      avg: Number(position.averagePrice),
      price: Number(last),
      marketValueMinor,
      pnlMinor,
      dayMinor,
      pnl: pnlLocal,
      day: dayLocal,
      fxRateToBase: fx,
      marketValueBase: Number((Number(marketValueMinor) / 100 * fx).toFixed(2)),
      pnlBase: Number((pnlLocal * fx).toFixed(2)),
      dayBase: Number((dayLocal * fx).toFixed(2)),
      pnlPct: cost === 0 ? 0 : Number(((pnlLocal / cost) * 100).toFixed(2)),
    };
  });
  return {
    accountId: state.account.id,
    accountName: state.account.name,
    baseCurrency: state.account.baseCurrency,
    equity: Number(equityUsd.toFixed(2)),
    buyingPower: Number(buyingPowerUsd.toFixed(2)),
    cash,
    positions,
    realizedPnlMinorByCurrency: state.account.realizedPnlMinorByCurrency,
    version: state.account.version,
    provenance: syntheticProvenance(now),
  };
}

export const marketIndices: Readonly<Record<Market, readonly Record<string, unknown>[]>> = {
  US: [
    { symbol: 'SPX', name: 'S&P 500', value: '6,389.77', change: 0.41, spark: [6310, 6326, 6338, 6329, 6354, 6371, 6389] },
    { symbol: 'NDX', name: 'Nasdaq 100', value: '23,452.09', change: 0.68, spark: [23020, 23140, 23118, 23260, 23318, 23380, 23452] },
    { symbol: 'DJI', name: 'Dow Jones', value: '44,862.23', change: -0.12, spark: [44940, 44905, 44922, 44888, 44910, 44872, 44862] },
  ],
  HK: [
    { symbol: 'HSI', name: 'Hang Seng', value: '25,562.13', change: 1.08, spark: [24980, 25040, 25118, 25262, 25310, 25472, 25562] },
    { symbol: 'HSTECH', name: 'Hang Seng TECH', value: '5,728.41', change: 1.74, spark: [5510, 5548, 5602, 5594, 5660, 5698, 5728] },
    { symbol: 'HSCEI', name: 'China Enterprises', value: '9,231.65', change: 0.96, spark: [9050, 9090, 9081, 9138, 9164, 9202, 9231] },
  ],
  CN: [
    { symbol: 'SHCOMP', name: 'Shanghai Composite', value: '3,678.22', change: 0.35, spark: [3628, 3639, 3648, 3651, 3664, 3670, 3678] },
    { symbol: 'CSI300', name: 'CSI 300', value: '4,127.16', change: 0.58, spark: [4051, 4070, 4064, 4092, 4104, 4115, 4127] },
    { symbol: 'CHINEXT', name: 'ChiNext', value: '2,341.92', change: 1.21, spark: [2268, 2280, 2302, 2294, 2318, 2330, 2341] },
  ],
};
