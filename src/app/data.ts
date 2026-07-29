export type Region = 'US' | 'HK' | 'CN';

export interface Equity {
  id?: string;
  instrumentId?: string;
  symbol: string;
  name: string;
  region: Region;
  exchange: string;
  currency: 'USD' | 'HKD' | 'CNY';
  price: number;
  change: number;
  changePct: number;
  volume: string;
  marketCap: string;
  sector: string;
  spark: number[];
  color: string;
  boardLot?: number;
  priceExact?: string;
  quote?: { at?: string; bid?: string; ask?: string; last?: string; previousClose?: string };
  provenance?: { classification: string; source: string; asOf: string; delayed: boolean; disclaimer: string };
}

const spark = (base: number, drift: number, volatility: number, count = 42) => {
  let value = base;
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index * 0.71) * volatility + Math.cos(index * 0.29) * volatility * 0.55;
    value += drift + wave * 0.22;
    return Number(value.toFixed(2));
  });
};

export const equities: Equity[] = [
  { symbol: 'NVDA', name: 'NVIDIA', region: 'US', exchange: 'NASDAQ', currency: 'USD', price: 176.75, change: 4.18, changePct: 2.42, volume: '198.4M', marketCap: '4.31T', sector: 'Semiconductors', spark: spark(164, .29, 2.8), color: '#83a8ff' },
  { symbol: 'AAPL', name: 'Apple', region: 'US', exchange: 'NASDAQ', currency: 'USD', price: 214.05, change: 1.64, changePct: .77, volume: '51.2M', marketCap: '3.19T', sector: 'Technology', spark: spark(207, .18, 1.8), color: '#aab8d5' },
  { symbol: 'TSLA', name: 'Tesla', region: 'US', exchange: 'NASDAQ', currency: 'USD', price: 318.72, change: -7.41, changePct: -2.27, volume: '92.6M', marketCap: '1.02T', sector: 'Automotive', spark: spark(338, -.41, 5.7), color: '#ef8e9b' },
  { symbol: 'MSFT', name: 'Microsoft', region: 'US', exchange: 'NASDAQ', currency: 'USD', price: 512.34, change: 3.84, changePct: .76, volume: '22.8M', marketCap: '3.81T', sector: 'Software', spark: spark(499, .31, 3.1), color: '#76b9ed' },
  { symbol: 'PLTR', name: 'Palantir', region: 'US', exchange: 'NASDAQ', currency: 'USD', price: 152.88, change: 6.02, changePct: 4.1, volume: '65.9M', marketCap: '365.2B', sector: 'Software', spark: spark(135, .43, 3.8), color: '#9eb6ff' },
  { symbol: '0700', name: 'Tencent', region: 'HK', exchange: 'HKEX', currency: 'HKD', price: 552.5, change: 9.5, changePct: 1.75, volume: '18.9M', marketCap: '5.09T', sector: 'Internet', spark: spark(518, .78, 5.4), color: '#56c5a8' },
  { symbol: '9988', name: 'Alibaba-SW', region: 'HK', exchange: 'HKEX', currency: 'HKD', price: 118.4, change: 3.7, changePct: 3.23, volume: '72.4M', marketCap: '2.26T', sector: 'E-commerce', spark: spark(104, .34, 2.4), color: '#f09a6d' },
  { symbol: '3690', name: 'Meituan-W', region: 'HK', exchange: 'HKEX', currency: 'HKD', price: 128.9, change: -2.1, changePct: -1.6, volume: '33.7M', marketCap: '795.6B', sector: 'Consumer', spark: spark(139, -.22, 2.9), color: '#ffd167' },
  { symbol: '1810', name: 'Xiaomi-W', region: 'HK', exchange: 'HKEX', currency: 'HKD', price: 57.45, change: 1.8, changePct: 3.23, volume: '142.1M', marketCap: '1.48T', sector: 'Hardware', spark: spark(49, .2, 1.6), color: '#ff9f66' },
  { symbol: '600519', name: 'Kweichow Moutai', region: 'CN', exchange: 'SSE', currency: 'CNY', price: 1456.8, change: 18.9, changePct: 1.31, volume: '3.2M', marketCap: '1.83T', sector: 'Consumer', spark: spark(1388, 1.6, 14), color: '#d8ae6f' },
  { symbol: '300750', name: 'CATL', region: 'CN', exchange: 'SZSE', currency: 'CNY', price: 286.43, change: 7.48, changePct: 2.68, volume: '22.6M', marketCap: '1.26T', sector: 'New Energy', spark: spark(260, .61, 4.1), color: '#62bfa8' },
  { symbol: '601318', name: 'Ping An', region: 'CN', exchange: 'SSE', currency: 'CNY', price: 56.72, change: -.64, changePct: -1.12, volume: '54.8M', marketCap: '1.03T', sector: 'Financials', spark: spark(60, -.08, .8), color: '#d6a56e' },
  { symbol: '688981', name: 'SMIC', region: 'CN', exchange: 'STAR', currency: 'CNY', price: 91.36, change: 4.72, changePct: 5.45, volume: '77.3M', marketCap: '728.1B', sector: 'Semiconductors', spark: spark(76, .38, 2.2), color: '#6b9cff' },
];

export const marketIndices = {
  US: [
    { symbol: 'SPX', name: 'S&P 500', value: '6,389.77', change: .41, spark: spark(6240, 3.7, 18) },
    { symbol: 'NDX', name: 'Nasdaq 100', value: '23,452.09', change: .68, spark: spark(22650, 19, 75) },
    { symbol: 'DJI', name: 'Dow Jones', value: '44,862.23', change: -.12, spark: spark(45080, -4.8, 95) },
  ],
  HK: [
    { symbol: 'HSI', name: 'Hang Seng', value: '25,562.13', change: 1.08, spark: spark(24700, 20, 72) },
    { symbol: 'HSTECH', name: 'Hang Seng TECH', value: '5,728.41', change: 1.74, spark: spark(5480, 5.7, 24) },
    { symbol: 'HSCEI', name: 'China Enterprises', value: '9,231.65', change: .96, spark: spark(8950, 6.8, 28) },
  ],
  CN: [
    { symbol: 'SHCOMP', name: 'Shanghai Composite', value: '3,678.22', change: .35, spark: spark(3610, 1.6, 9) },
    { symbol: 'CSI300', name: 'CSI 300', value: '4,127.16', change: .58, spark: spark(4020, 2.6, 12) },
    { symbol: 'CHINEXT', name: 'ChiNext', value: '2,341.92', change: 1.21, spark: spark(2220, 2.9, 11) },
  ],
};

export const sectors = [
  { name: 'Semiconductors', change: 3.84, weight: 1.9 },
  { name: 'AI Software', change: 2.62, weight: 1.45 },
  { name: 'New Energy', change: 1.91, weight: 1.3 },
  { name: 'Internet', change: 1.24, weight: 1.65 },
  { name: 'Healthcare', change: .47, weight: 1.0 },
  { name: 'Banks', change: -.32, weight: 1.3 },
  { name: 'Property', change: -1.18, weight: .9 },
  { name: 'Automotive', change: -2.05, weight: 1.25 },
];

export const positions = [
  { symbol: 'NVDA', name: 'NVIDIA', region: 'US' as Region, shares: 120, avg: 142.18, price: 176.75, day: 501.6, pnl: 4148.4, pnlPct: 24.31 },
  { symbol: '0700', name: 'Tencent', region: 'HK' as Region, shares: 600, avg: 497.2, price: 552.5, day: 5700, pnl: 33180, pnlPct: 11.12 },
  { symbol: '300750', name: 'CATL', region: 'CN' as Region, shares: 900, avg: 261.7, price: 286.43, day: 6732, pnl: 22257, pnlPct: 9.45 },
  { symbol: 'MSFT', name: 'Microsoft', region: 'US' as Region, shares: 34, avg: 476.4, price: 512.34, day: 130.56, pnl: 1221.96, pnlPct: 7.54 },
  { symbol: '9988', name: 'Alibaba-SW', region: 'HK' as Region, shares: 1200, avg: 124.6, price: 118.4, day: 4440, pnl: -7440, pnlPct: -4.98 },
];

export const orders = [
  { id: 'BS-28491', time: '14:31:08', symbol: 'NVDA', side: 'Buy', type: 'Limit', quantity: 40, filled: 40, price: 174.20, status: 'Filled', market: 'US' },
  { id: 'BS-28490', time: '13:56:42', symbol: '0700', side: 'Sell', type: 'Limit', quantity: 200, filled: 0, price: 558.00, status: 'Working', market: 'HK' },
  { id: 'BS-28488', time: '11:18:21', symbol: '300750', side: 'Buy', type: 'Stop limit', quantity: 300, filled: 0, price: 289.10, status: 'Queued', market: 'CN' },
  { id: 'BS-28486', time: '10:42:03', symbol: '9988', side: 'Buy', type: 'Market', quantity: 400, filled: 400, price: 116.70, status: 'Filled', market: 'HK' },
  { id: 'BS-28481', time: '09:37:52', symbol: 'TSLA', side: 'Sell', type: 'Stop', quantity: 18, filled: 18, price: 321.44, status: 'Filled', market: 'US' },
];

export const headlines = [
  { time: '3m', title: 'AI infrastructure names lead pre-market breadth', source: 'Market wire', tags: ['NVDA', 'AVGO'] },
  { time: '18m', title: 'Hong Kong technology shares extend a two-session rally', source: 'Asia desk', tags: ['0700', '9988'] },
  { time: '41m', title: 'Mainland battery supply chain sees renewed institutional flow', source: 'CN pulse', tags: ['300750'] },
];

export const portfolioCurve = spark(785_000, 1250, 6800, 72).map((value, index) => ({
  time: (Date.UTC(2026, 3, 10 + index) / 1000) as number,
  value,
}));

export const currencySymbol = (currency: Equity['currency']) => currency === 'USD' ? '$' : currency === 'HKD' ? 'HK$' : '¥';

export const formatCompact = (value: number, currency = '$') => `${currency}${Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)}`;
