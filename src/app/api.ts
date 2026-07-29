import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { equities, marketIndices, orders as fixtureOrders, positions as fixturePositions, type Equity, type Region } from './data';

export interface ProvenanceData {
  classification: 'SYNTHETIC';
  synthetic: true;
  source: string;
  asOf: string;
  ageSeconds: number;
  delayed: boolean;
  disclaimer: string;
}

export interface HealthData {
  ok: boolean;
  service: string;
  version: string;
  persistence: string;
  dataClassification: string;
  aiMode: 'deepseek-proxy' | 'deterministic-demo';
  now: string;
}

export interface SessionData {
  marketDate: string;
  localTime: string;
  phase: 'OPEN_AUCTION' | 'CONTINUOUS' | 'CLOSE_AUCTION' | 'CLOSED';
  acceptedOrderTypes: string[];
  isTradingDay: boolean;
}

export interface PortfolioPosition {
  instrumentId?: string;
  symbol: string;
  displaySymbol?: string;
  name: string;
  region: Region;
  shares: number;
  avg: number;
  price: number;
  pnl: number;
  day: number;
  pnlBase?: number;
  dayBase?: number;
  marketValueBase?: number;
  fxRateToBase?: number;
  pnlPct: number;
  currency?: string;
  availableQuantity?: number;
}

export interface PortfolioData {
  accountId?: string;
  accountName?: string;
  baseCurrency?: string;
  equity: number;
  buyingPower: number;
  positions: PortfolioPosition[];
  provenance?: ProvenanceData;
  cash?: Array<{ currency: string; balanceMinor: string; buyingPowerMinor: string }>;
}

export type ApiOrderStatus = 'PENDING_VALIDATION' | 'ACCEPTED' | 'TRIGGERED' | 'PARTIALLY_FILLED' | 'FILLED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

export interface ApiOrder {
  id: string;
  clientOrderId?: string;
  instrumentId: string;
  symbol: string;
  displaySymbol?: string;
  market: Region;
  currency: string;
  side: 'BUY' | 'SELL';
  displaySide: 'Buy' | 'Sell';
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  displayType: string;
  quantity: number;
  filledQuantity: number;
  filled: number;
  remainingQuantity: number;
  price: number;
  limitPrice?: string;
  stopPrice?: string;
  status: ApiOrderStatus;
  displayStatus: string;
  statusReason?: string;
  submittedAt: string;
  updatedAt: string;
  time: string;
}

export interface OrderEventData {
  id: string;
  type: string;
  resultingStatus: ApiOrderStatus;
  at: string;
  message: string;
  code?: string;
}

export interface OrderSubmitInput {
  clientOrderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  quantity: number;
  timeInForce: 'DAY' | 'GTC';
  limitPrice?: string;
  stopPrice?: string;
}

export interface OrderSubmitResult {
  order: ApiOrder;
  fills?: Array<{ id: string; quantity: number; price: string; at: string }>;
  events: OrderEventData[];
  portfolio?: PortfolioData;
  simulatedAt: string;
  execution: 'SYNTHETIC_PAPER_ONLY';
}

export interface BootstrapData {
  app: { name: string; mode: string; accountId: string };
  markets: Array<Equity & { market?: Region; session: SessionData }>;
  equities: Equity[];
  portfolio: PortfolioData;
  orders: ApiOrder[];
  provenance: ProvenanceData;
  capabilities: { markets: Region[]; orderTypes: string[]; timeInForce: string[]; aiCanSubmitOrders: false };
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; issues?: unknown; requestId?: string };
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code = 'REQUEST_ERROR', readonly issues?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export const fixtureMode = import.meta.env.VITE_DATA_MODE === 'fixture';

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & ApiErrorEnvelope;
  if (!response.ok) {
    throw new ApiError(payload.error?.message ?? `Beta-Stock service returned ${response.status}.`, response.status, payload.error?.code, payload.error?.issues);
  }
  return payload;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  return parseResponse<T>(response);
}

const fixtureProvenance: ProvenanceData = {
  classification: 'SYNTHETIC', synthetic: true, source: 'Browser fixture mode', asOf: '2026-07-27T02:00:00.000Z',
  ageSeconds: 0, delayed: true, disclaimer: 'Static fixture data. Not live market data and not investment advice.',
};

const normalizedFixtureOrders: ApiOrder[] = fixtureOrders.map((order) => ({
  id: order.id, instrumentId: `fixture-${order.symbol}`, symbol: order.symbol, market: order.market as Region, currency: order.market === 'US' ? 'USD' : order.market === 'HK' ? 'HKD' : 'CNY',
  side: order.side.toUpperCase() as 'BUY' | 'SELL', displaySide: order.side as 'Buy' | 'Sell',
  type: order.type.toUpperCase().replace(' ', '_') as ApiOrder['type'], displayType: order.type, quantity: order.quantity,
  filledQuantity: order.filled, filled: order.filled, remainingQuantity: order.quantity - order.filled, price: order.price,
  status: order.status === 'Working' ? 'ACCEPTED' : order.status === 'Queued' ? 'PENDING_VALIDATION' : 'FILLED',
  displayStatus: order.status, submittedAt: `2026-07-27T${order.time}.000Z`, updatedAt: `2026-07-27T${order.time}.000Z`, time: order.time,
}));

const fixtureFxToUsd = { USD: 1, HKD: 0.1279, CNY: 0.1394 } as const;
const normalizedFixturePositions: PortfolioPosition[] = fixturePositions.map((position) => {
  const currency = position.region === 'US' ? 'USD' : position.region === 'HK' ? 'HKD' : 'CNY';
  const fxRateToBase = fixtureFxToUsd[currency];
  return {
    ...position,
    currency,
    fxRateToBase,
    pnlBase: Number((position.pnl * fxRateToBase).toFixed(2)),
    dayBase: Number((position.day * fxRateToBase).toFixed(2)),
    marketValueBase: Number((position.price * position.shares * fxRateToBase).toFixed(2)),
  };
});
const fixturePortfolio: PortfolioData = { equity: 862_418.64, buyingPower: 287_804.12, positions: normalizedFixturePositions, provenance: fixtureProvenance };
const fixtureBootstrap: BootstrapData = {
  app: { name: 'Beta-Stock', mode: 'fixture', accountId: 'fixture-account' },
  markets: equities.map((equity) => ({ ...equity, session: { marketDate: '2026-07-27', localTime: '00:00', phase: 'CLOSED', acceptedOrderTypes: [], isTradingDay: true } })),
  equities, portfolio: fixturePortfolio, orders: normalizedFixtureOrders, provenance: fixtureProvenance,
  capabilities: { markets: ['US', 'HK', 'CN'], orderTypes: ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'], timeInForce: ['DAY', 'GTC'], aiCanSubmitOrders: false },
};

export const useHealth = () => useQuery({
  queryKey: ['health'],
  queryFn: () => fixtureMode ? Promise.resolve<HealthData>({ ok: true, service: 'Browser fixture mode', version: 'fixture', persistence: 'none', dataClassification: 'SYNTHETIC', aiMode: 'deterministic-demo', now: fixtureProvenance.asOf }) : apiRequest<HealthData>('/health'),
  retry: false,
  refetchInterval: 30_000,
});

export const useBootstrap = () => useQuery({
  queryKey: ['bootstrap'],
  queryFn: () => fixtureMode ? Promise.resolve(fixtureBootstrap) : apiRequest<BootstrapData>('/bootstrap'),
  retry: 1,
  refetchInterval: 60_000,
});

export const useEquities = (region?: Region) => useQuery({
  queryKey: ['equities', region],
  queryFn: () => fixtureMode
    ? Promise.resolve(region ? equities.filter((item) => item.region === region) : equities)
    : apiRequest<Equity[]>(`/markets/equities${region ? `?region=${region}` : ''}`),
});

export const useQuote = (symbol: string) => useQuery({
  queryKey: ['quote', symbol],
  queryFn: () => fixtureMode
    ? Promise.resolve(equities.find((item) => item.symbol === symbol) ?? equities[0])
    : apiRequest<Equity>(`/markets/quotes/${encodeURIComponent(symbol)}`),
});

export const useMarketIndices = (region: Region) => useQuery({
  queryKey: ['indices', region],
  queryFn: () => fixtureMode ? Promise.resolve(marketIndices[region]) : apiRequest<typeof marketIndices[Region]>(`/markets/indices?region=${region}`),
});

export const usePortfolio = () => useQuery({
  queryKey: ['portfolio'],
  queryFn: () => fixtureMode ? Promise.resolve(fixturePortfolio) : apiRequest<PortfolioData>('/portfolio'),
});

export const useOrders = () => useQuery({
  queryKey: ['orders'],
  queryFn: () => fixtureMode ? Promise.resolve(normalizedFixtureOrders) : apiRequest<ApiOrder[]>('/orders'),
});

export function useSubmitOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrderSubmitInput) => {
      if (fixtureMode) throw new ApiError('Order submission is disabled in explicit browser fixture mode.', 409, 'FIXTURE_MODE');
      const response = await fetch('/api/orders', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const payload = await response.json().catch(() => ({})) as OrderSubmitResult & ApiErrorEnvelope;
      if (response.status === 422 && payload.order) return payload;
      if (!response.ok) throw new ApiError(payload.error?.message ?? 'The simulated order was not submitted.', response.status, payload.error?.code, payload.error?.issues);
      return payload;
    },
    onSettled: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['orders'] }), client.invalidateQueries({ queryKey: ['portfolio'] }), client.invalidateQueries({ queryKey: ['bootstrap'] })]);
    },
  });
}

export function useCancelOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => fixtureMode
      ? Promise.reject(new ApiError('Cancellation is disabled in explicit browser fixture mode.', 409, 'FIXTURE_MODE'))
      : apiRequest<{ order: ApiOrder; simulatedAt: string }>(`/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' }),
    onSettled: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['orders'] }), client.invalidateQueries({ queryKey: ['portfolio'] }), client.invalidateQueries({ queryKey: ['bootstrap'] })]);
    },
  });
}

export function useResetSimulator() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => fixtureMode
      ? Promise.reject(new ApiError('Simulator reset is disabled in explicit browser fixture mode.', 409, 'FIXTURE_MODE'))
      : apiRequest<{ reset: true; accountId: string; portfolio: PortfolioData; message: string }>('/reset', { method: 'POST' }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['orders'] }),
        client.invalidateQueries({ queryKey: ['portfolio'] }),
        client.invalidateQueries({ queryKey: ['bootstrap'] }),
      ]);
    },
  });
}

export interface AiStreamResult { content: string; synthetic: boolean; model?: string }

export async function streamAiChat(messages: Array<{ role: 'user' | 'assistant'; content: string }>, onChunk: (content: string) => void, signal?: AbortSignal): Promise<AiStreamResult> {
  if (fixtureMode) throw new ApiError('AI requests require the local Beta-Stock server. Disable explicit fixture mode to continue.', 409, 'FIXTURE_MODE');
  const response = await fetch('/api/ai/chat', { method: 'POST', headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, stream: true }), signal });
  if (!response.ok) return parseResponse<AiStreamResult>(response);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream') || !response.body) throw new ApiError('The AI service returned an unsupported response.', 502, 'INVALID_AI_RESPONSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let content = '';
  let synthetic = false;
  let model: string | undefined;
  let streamError: { code: string; message: string } | undefined;
  const consume = (frame: string) => {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('');
    if (!data || data === '[DONE]') return;
    try {
      const payload = JSON.parse(data) as { synthetic?: boolean; model?: string; error?: { code?: string; message?: string }; choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }> };
      if (payload.error) {
        streamError = { code: payload.error.code ?? 'AI_STREAM_ERROR', message: payload.error.message ?? 'The AI stream ended unexpectedly.' };
        return;
      }
      synthetic ||= payload.synthetic === true;
      model = payload.model ?? model;
      const chunk = payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content ?? '';
      if (chunk) { content += chunk; onChunk(chunk); }
    } catch { /* Ignore malformed upstream frames; the server already sanitizes them. */ }
  };
  while (true) {
    const result = await reader.read();
    pending += decoder.decode(result.value, { stream: !result.done });
    let boundary = pending.search(/\r?\n\r?\n/);
    while (boundary >= 0) {
      const separator = pending.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? '\n\n';
      consume(pending.slice(0, boundary));
      pending = pending.slice(boundary + separator.length);
      boundary = pending.search(/\r?\n\r?\n/);
    }
    if (result.done) break;
  }
  if (pending.trim()) consume(pending);
  if (streamError) throw new ApiError(streamError.message, 502, streamError.code);
  if (!content) throw new ApiError('The AI service returned no visible content.', 502, 'EMPTY_AI_RESPONSE');
  return { content, synthetic, model };
}

export const dataMode = fixtureMode ? 'fixture' : 'api';
