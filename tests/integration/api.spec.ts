import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../server/app';

const runtimeRoot = path.resolve(
  process.env.BETA_STOCK_RUNTIME_DIR ?? '.runtime',
  'integration-tests',
);
const headers = { host: '127.0.0.1:4173' };

function makeDataDirectory(): string {
  fs.mkdirSync(runtimeRoot, { recursive: true });
  return fs.mkdtempSync(path.join(runtimeRoot, 'case-'));
}

function removeDataDirectory(directory: string): void {
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(`${runtimeRoot}${path.sep}`)) {
    throw new Error(`Refusing to remove unexpected test path ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

describe('Beta-Stock local API', () => {
  let app: FastifyInstance;
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = makeDataDirectory();
    app = await createApp({
      config: { dataDir: dataDirectory, isTest: true },
      now: () => new Date('2026-07-27T08:00:00.000Z'),
    });
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
    if (dataDirectory) removeDataDirectory(dataDirectory);
  });

  it('boots with all three markets and explicit synthetic provenance', async () => {
    const health = await app.inject({ method: 'GET', url: '/api/health', headers });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      ok: true,
      persistence: 'sqlite-wal',
      dataClassification: 'SYNTHETIC',
      aiMode: 'deterministic-demo',
    });

    const bootstrap = await app.inject({ method: 'GET', url: '/api/bootstrap', headers });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.headers['x-beta-stock-data-classification']).toBe('SYNTHETIC');
    const body = bootstrap.json();
    expect(new Set(body.markets.map((item: { market: string }) => item.market))).toEqual(new Set(['US', 'HK', 'CN']));
    expect(body.capabilities.aiCanSubmitOrders).toBe(false);
    expect(body.provenance.synthetic).toBe(true);
  });

  it('cites submitted provenance in deterministic AI responses without inventing freshness', async () => {
    const withContext = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: {
        stream: false,
        messages: [{
          role: 'user',
          content: [
            'Stress-test my portfolio and cite the data age.',
            '',
            'Simulator context supplied by Beta-Stock: Data classification: SYNTHETIC. Source: Beta-Stock deterministic demo engine. Data as of: 2026-07-27T02:00:00.000Z. Market coverage: US, HK, CN. Paper portfolio equity: 250000 USD. Positions: none.',
          ].join('\n'),
        }],
      },
    });
    expect(withContext.statusCode).toBe(200);
    const content = withContext.json().choices[0].message.content as string;
    expect(content).toContain('Market context: SYNTHETIC; coverage US, HK, CN; source Beta-Stock deterministic demo engine; as of 2026-07-27T02:00:00.000Z. [S1]');
    expect(content).toContain('Paper account: equity 250000 USD; positions none. [S2]');
    expect(content).toContain('submitted as-of timestamp is metadata, not proof of freshness or live status');
    expect(content).toContain('No directional market claim is supported');
    expect(content).not.toContain('favors selective momentum');
    expect(content).not.toContain('improving breadth');
    expect(content).toContain('no DeepSeek request was made');

    const withoutContext = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: {
        stream: false,
        messages: [{ role: 'user', content: 'Stress-test my portfolio and cite the data age.' }],
      },
    });
    expect(withoutContext.statusCode).toBe(200);
    const unavailableContent = withoutContext.json().choices[0].message.content as string;
    expect(unavailableContent).toContain('Market context: Unavailable in submitted context; coverage Unavailable in submitted context; source Unavailable in submitted context; as of Unavailable in submitted context. [S1]');
    expect(unavailableContent).toContain('Paper account: equity Unavailable in submitted context; positions Unavailable in submitted context. [S2]');
    expect(unavailableContent).toContain('No data age, freshness, or live status can be inferred. [S1]');
  });

  it('serves compatible market lists, quotes, bars, and snapshots', async () => {
    const equities = await app.inject({
      method: 'GET',
      url: '/api/markets/equities?region=HK',
      headers,
    });
    expect(equities.statusCode).toBe(200);
    expect(equities.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: '0700', region: 'HK', priceExact: expect.any(String) }),
    ]));

    const quote = await app.inject({ method: 'GET', url: '/api/markets/quotes/0700', headers });
    expect(quote.statusCode).toBe(200);
    expect(quote.json()).toMatchObject({ region: 'HK', provenance: { classification: 'SYNTHETIC' } });

    const bars = await app.inject({ method: 'GET', url: '/api/bars/NVDA?limit=12', headers });
    expect(bars.statusCode).toBe(200);
    expect(bars.json().bars).toHaveLength(12);

    const snapshots = await app.inject({
      method: 'GET',
      url: '/api/snapshots?symbols=AAPL,0700,300750',
      headers,
    });
    expect(snapshots.statusCode).toBe(200);
    expect(snapshots.json().snapshots).toHaveLength(3);

    const portfolio = await app.inject({ method: 'GET', url: '/api/portfolio', headers });
    expect(portfolio.statusCode).toBe(200);
    expect(portfolio.json()).toMatchObject({ baseCurrency: 'USD' });
    expect(portfolio.json().positions).toEqual(expect.arrayContaining([
      expect.objectContaining({ currency: expect.any(String), pnlBase: expect.any(Number), dayBase: expect.any(Number), fxRateToBase: expect.any(Number) }),
    ]));
  });

  it('fills a valid US paper order and replays its idempotency key', async () => {
    const payload = {
      clientOrderId: 'integration-us-buy-1',
      symbol: 'AAPL',
      side: 'buy',
      type: 'market',
      quantity: 2,
      timeInForce: 'DAY',
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { ...headers, 'content-type': 'application/json' },
      payload,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      order: { status: 'FILLED', side: 'BUY', symbol: 'AAPL' },
      execution: 'SYNTHETIC_PAPER_ONLY',
    });
    expect(created.json().fills).toHaveLength(1);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { ...headers, 'content-type': 'application/json' },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.headers['x-idempotent-replay']).toBe('true');
    expect(replay.json().order.id).toBe(created.json().order.id);
  });

  it('applies Mainland board-lot validation and cancels a working HK order', async () => {
    const invalidLot = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: {
        symbol: '300750', side: 'BUY', type: 'LIMIT', quantity: 1,
        timeInForce: 'DAY', limitPrice: '284.32',
      },
    });
    expect(invalidLot.statusCode).toBe(422);
    expect(invalidLot.json().order).toMatchObject({ status: 'REJECTED', rejectionCode: 'LOT_SIZE' });

    const working = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: {
        symbol: '0700', side: 'BUY', type: 'LIMIT', quantity: 100,
        timeInForce: 'DAY', limitPrice: '500',
      },
    });
    expect(working.statusCode).toBe(201);
    expect(working.json().order.status).toBe('ACCEPTED');

    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/orders/${working.json().order.id}/cancel`,
      headers,
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().order.status).toBe('CANCELLED');
  });

  it('restores exact order state from SQLite across an app restart', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: {
        clientOrderId: 'persist-me', symbol: 'AAPL', side: 'BUY', type: 'MARKET',
        quantity: 1, timeInForce: 'DAY',
      },
    });
    expect(created.statusCode).toBe(201);
    const orderId = created.json().order.id;
    await app.close();

    app = await createApp({ config: { dataDir: dataDirectory, isTest: true } });
    await app.ready();
    const orders = await app.inject({ method: 'GET', url: '/api/orders', headers });
    expect(orders.statusCode).toBe(200);
    expect(orders.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: orderId })]));
  });

  it('resets only the local deterministic paper portfolio', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { symbol: 'AAPL', side: 'BUY', type: 'MARKET', quantity: 1, timeInForce: 'DAY' },
    });
    const reset = await app.inject({ method: 'POST', url: '/api/reset', headers });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({ reset: true, accountId: 'demo-account' });
    const orders = await app.inject({ method: 'GET', url: '/api/orders', headers });
    expect(orders.json()).toEqual([]);
  });
});
