import fs from 'node:fs';
import path from 'node:path';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  SimulationEngine,
  createDemoEnvironment,
  getMarketRules,
  getSessionState,
  marketDate,
  type Market,
  type OrderRequest,
  type Quote,
} from '../src/domain/index';
import { registerAiRoutes, type AiRouteOptions } from './ai';
import {
  isAllowedLoopbackHost,
  isAllowedLoopbackOrigin,
  loadConfig,
  type ConfigOverrides,
  type ServerConfig,
} from './config';
import { syntheticProvenance } from './provenance';
import { SqliteStateRepository } from './repository';
import {
  equityView,
  findInstrument,
  marketIndices,
  orderView,
  portfolioView,
} from './views';

interface AppOptions {
  readonly config?: ConfigOverrides;
  readonly fetchImplementation?: AiRouteOptions['fetchImplementation'];
  readonly now?: () => Date;
}

interface PublicError extends Error {
  readonly statusCode?: number;
  readonly code?: string;
  readonly issues?: unknown;
}

const marketSchema = z.enum(['US', 'HK', 'CN']);
const barsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(120),
}).strict();
const equitiesQuerySchema = z.object({
  region: marketSchema.optional(),
}).strict();
const indexQuerySchema = z.object({ region: marketSchema.default('US') }).strict();
const snapshotQuerySchema = z.object({
  symbols: z.string().max(300).optional(),
}).strict();

// Fixture generation performs exchange-session traversal and is deliberately deterministic.
// Build it once per process so short-lived tests and local app factories do not repeat that work.
const demoEnvironment = createDemoEnvironment({
  seed: 'beta-stock-market-quality-v1',
  asOf: '2026-07-27T02:00:00.000Z',
  barCount: 120,
});

// Prices are exact decimal strings at the API boundary. Bounding both the whole and
// fractional portions prevents pathological BigInt work and scientific-notation drift.
const decimalInput = z.string().min(1).max(32).regex(/^\d{1,18}(?:\.\d{1,12})?$/);
const orderBodySchema = z.object({
  clientOrderId: z.string().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  instrumentId: z.string().min(1).max(64).optional(),
  symbol: z.string().min(1).max(32).optional(),
  side: z.string().transform((value) => value.toUpperCase()).pipe(z.enum(['BUY', 'SELL'])),
  type: z.string()
    .transform((value) => value.toUpperCase().replace(/[ -]+/g, '_'))
    .pipe(z.enum(['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'])),
  quantity: z.number().int().positive().max(3_000_000),
  timeInForce: z.string().default('DAY').transform((value) => value.toUpperCase()).pipe(z.enum(['DAY', 'GTC'])),
  limitPrice: decimalInput.optional(),
  stopPrice: decimalInput.optional(),
}).strict().refine((value) => value.instrumentId !== undefined || value.symbol !== undefined, {
  message: 'instrumentId or symbol is required.',
  path: ['instrumentId'],
});

function parse<T>(schema: z.ZodType<T>, value: unknown, code: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const error = new Error('Request validation failed.') as PublicError;
  Object.assign(error, { statusCode: 400, code, issues: parsed.error.issues });
  throw error;
}

function continuousQuote(quote: Quote, market: Market): Quote {
  const at = market === 'US' ? '2026-07-24T18:00:00.000Z' : '2026-07-27T02:00:00.000Z';
  return { ...quote, at, tradingDate: marketDate(at, market) };
}

function dataHeaders(reply: FastifyReply, now: Date): void {
  const provenance = syntheticProvenance(now);
  reply
    .header('X-Beta-Stock-Data-Classification', provenance.classification)
    .header('X-Beta-Stock-Data-Age-Seconds', provenance.ageSeconds.toString())
    .header('Cache-Control', 'no-store');
}

function safeErrorMessage(statusCode: number, error: PublicError): string {
  if (statusCode >= 500) return 'Beta-Stock could not complete that request.';
  return error.message || 'Request failed.';
}

export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const config: ServerConfig = loadConfig(options.config);
  const now = options.now ?? (() => new Date());
  const app = Fastify({
    logger: config.isTest ? false : {
      level: process.env.BETA_STOCK_LOG_LEVEL ?? 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'request.headers.authorization',
          'request.body',
          'body',
          '*.apiKey',
          '*.deepSeekApiKey',
        ],
        censor: '[REDACTED]',
      },
    },
    bodyLimit: 64 * 1_024,
    trustProxy: false,
    requestIdHeader: false,
  });
  const environment = demoEnvironment;
  const repository = new SqliteStateRepository(config.dataDir);
  const restored = repository.load();
  let engine = restored
    ? SimulationEngine.fromSnapshot(environment.instruments, restored)
    : new SimulationEngine({
      instruments: environment.instruments,
      account: structuredClone(environment.account),
    });
  if (!restored) repository.save(engine.snapshot(), environment.asOf);

  await app.register(helmet, {
    global: true,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'none'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        workerSrc: ["'self'", 'blob:'],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(rateLimit, {
    global: true,
    max: 240,
    timeWindow: '1 minute',
    ban: 3,
    // Browser bundles, fonts, images and SPA navigation are immutable/local files and must
    // never be banned by API traffic. API routes retain this global ceiling plus their
    // narrower per-route limits below.
    allowList: (request) => !request.raw.url?.startsWith('/api/'),
  });
  await app.register(cors, {
    origin(origin, callback) {
      callback(null, isAllowedLoopbackOrigin(origin, config));
    },
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Content-Type'],
    maxAge: 600,
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!isAllowedLoopbackHost(request.headers.host, config.port)) {
      return reply.code(421).send({ error: { code: 'INVALID_HOST', message: 'Beta-Stock accepts only its loopback host.' } });
    }
    if (!isAllowedLoopbackOrigin(request.headers.origin, config)) {
      return reply.code(403).send({ error: { code: 'ORIGIN_DENIED', message: 'This origin is not allowed.' } });
    }
    return undefined;
  });
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Request-Id', request.id);
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setErrorHandler((error: PublicError, request, reply) => {
    const statusCode = Number.isInteger(error.statusCode) && (error.statusCode ?? 500) >= 400
      ? Math.min(error.statusCode ?? 500, 599)
      : 500;
    if (statusCode >= 500) request.log.error({ errorName: error.name, code: error.code }, 'Request failed');
    return reply.code(statusCode).send({
      error: {
        code: error.code ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
        message: safeErrorMessage(statusCode, error),
        ...(statusCode < 500 && error.issues ? { issues: error.issues } : {}),
        requestId: request.id,
      },
    });
  });

  app.get('/api/health', { config: { rateLimit: false } }, async (_request, reply) => {
    return reply.send({
      ok: true,
      service: 'Beta-Stock local market simulator',
      version: '0.1.0',
      persistence: 'sqlite-wal',
      dataClassification: 'SYNTHETIC',
      aiMode: config.deepSeekApiKey ? 'deepseek-proxy' : 'deterministic-demo',
      now: now().toISOString(),
    });
  });

  app.get('/api/bootstrap', async (_request, reply) => {
    const currentNow = now();
    dataHeaders(reply, currentNow);
    const state = engine.snapshot();
    return {
      app: { name: 'Beta-Stock', mode: 'paper-trading', accountId: state.account.id },
      markets: environment.instruments.map((instrument) => ({
        ...instrument,
        session: getSessionState(getMarketRules(instrument.market, environment.asOf), environment.asOf),
      })),
      equities: environment.instruments.map((instrument) => equityView(
        instrument,
        environment.quotes[instrument.id],
        environment.bars[instrument.id],
        currentNow,
      )),
      portfolio: portfolioView(state, environment.instruments, environment.quotes, currentNow),
      orders: Object.values(state.orders).sort((a, b) => b.sequence - a.sequence)
        .map((order) => orderView(order, environment.instruments)),
      provenance: syntheticProvenance(currentNow),
      capabilities: {
        markets: ['US', 'HK', 'CN'],
        orderTypes: ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'],
        timeInForce: ['DAY', 'GTC'],
        aiCanSubmitOrders: false,
      },
    };
  });

  app.get('/api/markets', async (_request, reply) => {
    const currentNow = now();
    dataHeaders(reply, currentNow);
    return {
      instruments: environment.instruments,
      sessions: Object.fromEntries((['US', 'HK', 'CN'] as const).map((market) => {
        const rules = getMarketRules(market, environment.asOf);
        return [market, { rules, state: getSessionState(rules, environment.asOf) }];
      })),
      provenance: syntheticProvenance(currentNow),
    };
  });

  app.get('/api/markets/equities', async (request, reply) => {
    const query = parse(equitiesQuerySchema, request.query, 'INVALID_MARKET_QUERY');
    const currentNow = now();
    dataHeaders(reply, currentNow);
    return environment.instruments
      .filter((instrument) => !query.region || instrument.market === query.region)
      .map((instrument) => equityView(
        instrument,
        environment.quotes[instrument.id],
        environment.bars[instrument.id],
        currentNow,
      ));
  });

  app.get('/api/markets/indices', async (request, reply) => {
    const query = parse(indexQuerySchema, request.query, 'INVALID_INDEX_QUERY');
    const currentNow = now();
    dataHeaders(reply, currentNow);
    return marketIndices[query.region].map((index) => ({
      ...index,
      region: query.region,
      provenance: syntheticProvenance(currentNow),
    }));
  });

  app.get('/api/markets/quotes/:symbol', async (request, reply) => {
    const symbol = z.string().min(1).max(64).parse((request.params as { symbol?: unknown }).symbol);
    const instrument = findInstrument(environment.instruments, symbol);
    if (!instrument) return reply.code(404).send({ error: { code: 'UNKNOWN_INSTRUMENT', message: 'Instrument not found.' } });
    const currentNow = now();
    dataHeaders(reply, currentNow);
    return equityView(
      instrument,
      environment.quotes[instrument.id],
      environment.bars[instrument.id],
      currentNow,
    );
  });

  const barsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const symbol = z.string().min(1).max(64).parse((request.params as { symbol?: unknown }).symbol);
    const query = parse(barsQuerySchema, request.query, 'INVALID_BARS_QUERY');
    const instrument = findInstrument(environment.instruments, symbol);
    if (!instrument) return reply.code(404).send({ error: { code: 'UNKNOWN_INSTRUMENT', message: 'Instrument not found.' } });
    const currentNow = now();
    dataHeaders(reply, currentNow);
    return {
      instrumentId: instrument.id,
      symbol: instrument.displaySymbol,
      intervalMinutes: 30,
      bars: environment.bars[instrument.id].slice(-query.limit),
      provenance: syntheticProvenance(currentNow),
    };
  };
  app.get('/api/markets/bars/:symbol', barsHandler);
  app.get('/api/bars/:symbol', barsHandler);

  app.get('/api/snapshots', async (request, reply) => {
    const query = parse(snapshotQuerySchema, request.query, 'INVALID_SNAPSHOT_QUERY');
    const requested = query.symbols?.split(',').map((value) => value.trim()).filter(Boolean);
    const instruments = requested
      ? requested.map((symbol) => findInstrument(environment.instruments, symbol)).filter(Boolean)
      : environment.instruments;
    const currentNow = now();
    dataHeaders(reply, currentNow);
    return {
      snapshots: instruments.map((instrument) => ({
        instrument,
        quote: environment.quotes[instrument!.id],
      })),
      provenance: syntheticProvenance(currentNow),
    };
  });

  app.get('/api/snapshots/:symbol', async (request, reply) => {
    const symbol = z.string().min(1).max(64).parse((request.params as { symbol?: unknown }).symbol);
    const instrument = findInstrument(environment.instruments, symbol);
    if (!instrument) return reply.code(404).send({ error: { code: 'UNKNOWN_INSTRUMENT', message: 'Instrument not found.' } });
    const currentNow = now();
    dataHeaders(reply, currentNow);
    return { instrument, quote: environment.quotes[instrument.id], provenance: syntheticProvenance(currentNow) };
  });

  app.get('/api/portfolio', async (_request, reply) => {
    const currentNow = now();
    dataHeaders(reply, currentNow);
    return portfolioView(engine.snapshot(), environment.instruments, environment.quotes, currentNow);
  });

  app.get('/api/orders', async () => {
    const state = engine.snapshot();
    return Object.values(state.orders).sort((a, b) => b.sequence - a.sequence)
      .map((order) => orderView(order, environment.instruments));
  });

  app.post('/api/orders', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = parse(orderBodySchema, request.body, 'INVALID_ORDER');
    const instrument = findInstrument(environment.instruments, body.instrumentId ?? body.symbol ?? '');
    if (!instrument) {
      return reply.code(404).send({ error: { code: 'UNKNOWN_INSTRUMENT', message: 'Instrument not found.' } });
    }
    if (body.clientOrderId) {
      const existing = Object.values(engine.snapshot().orders)
        .find((order) => order.clientOrderId === body.clientOrderId);
      if (existing) {
        return reply.header('X-Idempotent-Replay', 'true').send({
          order: orderView(existing, environment.instruments),
          state: engine.snapshot(),
        });
      }
    }
    const orderRequest: OrderRequest = {
      ...(body.clientOrderId ? { clientOrderId: body.clientOrderId } : {}),
      instrumentId: instrument.id,
      side: body.side,
      type: body.type,
      quantity: body.quantity,
      timeInForce: body.timeInForce,
      ...(body.limitPrice ? { limitPrice: body.limitPrice } : {}),
      ...(body.stopPrice ? { stopPrice: body.stopPrice } : {}),
    };
    const quote = continuousQuote(environment.quotes[instrument.id], instrument.market);
    const order = engine.submit(orderRequest, { at: quote.at, quote, executeImmediately: true });
    const state = engine.snapshot();
    repository.save(state, now().toISOString());
    const statusCode = order.status === 'REJECTED' ? 422 : 201;
    return reply.code(statusCode).send({
      order: orderView(order, environment.instruments),
      fills: state.fills.filter((fill) => fill.orderId === order.id),
      events: state.events.filter((event) => event.orderId === order.id),
      portfolio: portfolioView(state, environment.instruments, environment.quotes, now()),
      simulatedAt: quote.at,
      execution: 'SYNTHETIC_PAPER_ONLY',
    });
  });

  app.post('/api/orders/:orderId/cancel', async (request, reply) => {
    const orderId = z.string().min(1).max(64).parse((request.params as { orderId?: unknown }).orderId);
    const existing = engine.getOrder(orderId);
    if (!existing) return reply.code(404).send({ error: { code: 'UNKNOWN_ORDER', message: 'Order not found.' } });
    const instrument = environment.instruments.find((item) => item.id === existing.instrumentId)!;
    const at = continuousQuote(environment.quotes[instrument.id], instrument.market).at;
    const order = engine.cancel(orderId, at);
    repository.save(engine.snapshot(), now().toISOString());
    return { order: orderView(order, environment.instruments), simulatedAt: at };
  });

  app.delete('/api/orders/:orderId', async (request, reply) => {
    const orderId = z.string().min(1).max(64).parse((request.params as { orderId?: unknown }).orderId);
    const existing = engine.getOrder(orderId);
    if (!existing) return reply.code(404).send({ error: { code: 'UNKNOWN_ORDER', message: 'Order not found.' } });
    const instrument = environment.instruments.find((item) => item.id === existing.instrumentId)!;
    const at = continuousQuote(environment.quotes[instrument.id], instrument.market).at;
    const order = engine.cancel(orderId, at);
    repository.save(engine.snapshot(), now().toISOString());
    return { order: orderView(order, environment.instruments), simulatedAt: at };
  });

  app.post('/api/reset', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (_request, reply) => {
    engine = new SimulationEngine({
      instruments: environment.instruments,
      account: structuredClone(environment.account),
    });
    repository.save(engine.snapshot(), now().toISOString());
    return reply.send({
      reset: true,
      accountId: environment.account.id,
      portfolio: portfolioView(engine.snapshot(), environment.instruments, environment.quotes, now()),
      message: 'The deterministic paper portfolio has been restored. No external order was sent.',
    });
  });

  registerAiRoutes(app, {
    config,
    ...(options.fetchImplementation ? { fetchImplementation: options.fetchImplementation } : {}),
  });

  const distDir = path.join(config.rootDir, 'dist');
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: '/',
      index: false,
      wildcard: false,
      immutable: true,
      maxAge: '1y',
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } });
    }
    if (fs.existsSync(path.join(distDir, 'index.html')) && request.headers.accept?.includes('text/html')) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html', { maxAge: 0, immutable: false });
    }
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
  });

  app.addHook('onClose', async () => {
    repository.close();
  });

  return app;
}
