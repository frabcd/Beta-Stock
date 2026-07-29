import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../server/app';
import { loadConfig } from '../../server/config';

const runtimeRoot = path.resolve(
  process.env.BETA_STOCK_RUNTIME_DIR ?? '.runtime',
  'security-tests',
);
const loopbackHost = { host: '127.0.0.1:4173' };
const apps: FastifyInstance[] = [];
const directories: string[] = [];

function makeDataDirectory(): string {
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(runtimeRoot, 'case-'));
  directories.push(directory);
  return directory;
}

async function makeApp(options: Parameters<typeof createApp>[0] = {}): Promise<FastifyInstance> {
  const app = await createApp({
    ...options,
    config: {
      dataDir: makeDataDirectory(),
      isTest: true,
      ...options.config,
    },
  });
  apps.push(app);
  await app.ready();
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const directory of directories.splice(0)) {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(`${runtimeRoot}${path.sep}`)) {
      throw new Error(`Refusing to remove unexpected test path ${resolved}`);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe('Beta-Stock security boundary', () => {
  it('contains writable storage and makes the Windows E policy explicit', () => {
    const portableRoot = process.platform === 'win32'
      ? 'C:/portable-beta-stock-config-test'
      : path.resolve('.runtime/portable-beta-stock-config-test');
    const portable = loadConfig({
      rootDir: portableRoot,
      dataDir: path.join(portableRoot, '.data'),
      cacheDir: path.join(portableRoot, '.cache'),
      runtimeDir: path.join(portableRoot, '.runtime'),
      logDir: path.join(portableRoot, '.logs'),
      storagePolicy: 'portable',
      isTest: true,
    });
    expect(portable.rootDir).toBe(path.resolve(portableRoot));
    expect(portable.storagePolicy).toBe('portable');

    expect(() => loadConfig({
      rootDir: portableRoot,
      dataDir: path.resolve(portableRoot, '..', 'escaped-data'),
      cacheDir: path.join(portableRoot, '.cache'),
      runtimeDir: path.join(portableRoot, '.runtime'),
      logDir: path.join(portableRoot, '.logs'),
      storagePolicy: 'portable',
      isTest: true,
    })).toThrow(/within BETA_STOCK_ROOT/);

    if (process.platform === 'win32') {
      expect(() => loadConfig({
        rootDir: portableRoot,
        storagePolicy: 'strict-e',
        isTest: true,
      })).toThrow(/E: drive/);
      const strictRoot = 'E:/Beta-Stock';
      const strict = loadConfig({
        rootDir: strictRoot,
        dataDir: path.join(strictRoot, '.data'),
        cacheDir: path.join(strictRoot, '.cache'),
        runtimeDir: path.join(strictRoot, '.runtime'),
        logDir: path.join(strictRoot, '.logs'),
        storagePolicy: 'strict-e',
        isTest: true,
      });
      expect(strict.storagePolicy).toBe('strict-e');
    } else {
      expect(() => loadConfig({
        rootDir: portableRoot,
        storagePolicy: 'strict-e',
        isTest: true,
      })).toThrow(/only on Windows/);
    }
  });

  it('rejects DNS-rebinding hosts and cross-origin requests', async () => {
    const app = await makeApp();
    const badHost = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'attacker.example' },
    });
    expect(badHost.statusCode).toBe(421);

    const badOrigin = await app.inject({
      method: 'POST',
      url: '/api/reset',
      headers: { ...loopbackHost, origin: 'https://attacker.example' },
    });
    expect(badOrigin.statusCode).toBe(403);
    expect(badOrigin.headers['access-control-allow-origin']).toBeUndefined();

    const sameOrigin = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { ...loopbackHost, origin: 'http://127.0.0.1:4173' },
    });
    expect(sameOrigin.statusCode).toBe(200);
    expect(sameOrigin.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4173');

    const implicitDevOrigin = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { ...loopbackHost, origin: 'http://127.0.0.1:5173' },
    });
    expect(implicitDevOrigin.statusCode).toBe(403);

    const developmentApp = await makeApp({
      config: { allowedOrigins: ['http://127.0.0.1:5173'] },
    });
    const explicitDevOrigin = await developmentApp.inject({
      method: 'GET',
      url: '/api/health',
      headers: { ...loopbackHost, origin: 'http://127.0.0.1:5173' },
    });
    expect(explicitDevOrigin.statusCode).toBe(200);
    expect(explicitDevOrigin.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
  });

  it('sets a restrictive browser policy and does not expose a generic proxy', async () => {
    const app = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/api/health', headers: loopbackHost });
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['permissions-policy']).toContain('camera=()');

    const proxy = await app.inject({
      method: 'POST',
      url: '/api/proxy',
      headers: { ...loopbackHost, 'content-type': 'application/json' },
      payload: { url: 'http://169.254.169.254/latest/meta-data' },
    });
    expect(proxy.statusCode).toBe(404);
  });

  it('enforces strict body, schema, and AI history limits without echoing input', async () => {
    const app = await makeApp();
    const oversized = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { ...loopbackHost, 'content-type': 'application/json' },
      payload: { messages: [{ role: 'user', content: 'private-marker'.repeat(7_000) }] },
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.payload).not.toContain('private-marker');

    const unknownField = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { ...loopbackHost, 'content-type': 'application/json' },
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
        url: 'https://attacker.example',
      },
    });
    expect(unknownField.statusCode).toBe(400);
    expect(unknownField.json().error.code).toBe('INVALID_AI_REQUEST');

    const longHistory = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { ...loopbackHost, 'content-type': 'application/json' },
      payload: {
        messages: Array.from({ length: 5 }, () => ({ role: 'user', content: 'x'.repeat(2_500) })),
      },
    });
    expect(longHistory.statusCode).toBe(400);
  });

  it('ignores an untrusted inherited key and returns a polished deterministic demo', async () => {
    const previousKey = process.env.DEEPSEEK_API_KEY;
    const previousSource = process.env.BETA_STOCK_DEEPSEEK_KEY_SOURCE;
    process.env.DEEPSEEK_API_KEY = 'untrusted-inherited-value-never-use';
    delete process.env.BETA_STOCK_DEEPSEEK_KEY_SOURCE;
    try {
      const app = await makeApp();
      const health = await app.inject({ method: 'GET', url: '/api/health', headers: loopbackHost });
      expect(health.json().aiMode).toBe('deterministic-demo');
      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/chat',
        headers: { ...loopbackHost, 'content-type': 'application/json' },
        payload: { messages: [{ role: 'user', content: 'Review HK momentum' }], stream: false },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ synthetic: true, demo: true });
      expect(response.json().choices[0].message.content).toContain('cannot place orders');
      expect(response.payload).not.toContain('untrusted-inherited');
    } finally {
      if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = previousKey;
      if (previousSource === undefined) delete process.env.BETA_STOCK_DEEPSEEK_KEY_SOURCE;
      else process.env.BETA_STOCK_DEEPSEEK_KEY_SOURCE = previousSource;
    }
  });

  it('uses only the current V4 default allowlist', async () => {
    const app = await makeApp();
    for (const model of ['deepseek-chat', 'deepseek-reasoner']) {
      const blocked = await app.inject({
        method: 'POST',
        url: '/api/ai/chat',
        headers: { ...loopbackHost, 'content-type': 'application/json' },
        payload: { messages: [{ role: 'user', content: 'hello' }], model, stream: false },
      });
      expect(blocked.statusCode).toBe(400);
      expect(blocked.json().error.allowedModels).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro']);
    }
    const current = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { ...loopbackHost, 'content-type': 'application/json' },
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
        model: 'deepseek-v4-pro',
        stream: false,
      },
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().model).toBe('deepseek-v4-pro');
  });

  it('accepts an environment key only with the explicit env trust marker', async () => {
    const previousKey = process.env.DEEPSEEK_API_KEY;
    const previousSource = process.env.BETA_STOCK_DEEPSEEK_KEY_SOURCE;
    process.env.DEEPSEEK_API_KEY = 'development-test-value';
    process.env.BETA_STOCK_DEEPSEEK_KEY_SOURCE = 'env';
    try {
      const app = await makeApp();
      const health = await app.inject({ method: 'GET', url: '/api/health', headers: loopbackHost });
      expect(health.json().aiMode).toBe('deepseek-proxy');
    } finally {
      if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = previousKey;
      if (previousSource === undefined) delete process.env.BETA_STOCK_DEEPSEEK_KEY_SOURCE;
      else process.env.BETA_STOCK_DEEPSEEK_KEY_SOURCE = previousSource;
    }
  });

  it('calls only the fixed official DeepSeek endpoint with an allowlisted model', async () => {
    const fakeKey = 'test-only-value-not-a-real-secret';
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      id: 'upstream-test',
      choices: [{
        message: {
          role: 'assistant',
          content: 'Analysis only.',
          reasoning_content: 'private chain of thought',
        },
        finish_reason: 'stop',
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const app = await makeApp({
      config: {
        deepSeekApiKey: fakeKey,
        deepSeekAllowedModels: ['deepseek-v4-flash'],
        deepSeekModel: 'deepseek-v4-flash',
      },
      fetchImplementation: fetchSpy as unknown as typeof fetch,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { ...loopbackHost, 'content-type': 'application/json' },
      payload: { messages: [{ role: 'user', content: 'Summarize the synthetic tape.' }], stream: false },
    });
    expect(response.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.redirect).toBe('error');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${fakeKey}`);
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'deepseek-v4-flash',
      stream: false,
      max_tokens: 1_200,
      thinking: { type: 'disabled' },
    });
    const upstreamBody = JSON.parse(init.body as string) as { messages: Array<{ role: string; content: string }> };
    expect(upstreamBody.messages[0]).toMatchObject({ role: 'system' });
    expect(upstreamBody.messages[0].content).toContain('[S1]');
    expect(upstreamBody.messages[0].content).toContain('[S2]');
    expect(upstreamBody.messages[0].content).toContain('same-page evidence tokens');
    expect(upstreamBody.messages[0].content).toContain('not proof of freshness or live status');
    expect(upstreamBody.messages[0].content).toContain('never create other reference tokens, Markdown links, or source URLs');
    expect(response.payload).not.toContain(fakeKey);
    expect(response.payload).not.toContain('reasoning_content');
    expect(response.payload).not.toContain('private chain of thought');

    const blockedModel = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { ...loopbackHost, 'content-type': 'application/json' },
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
        model: 'unapproved-model',
        stream: false,
      },
    });
    expect(blockedModel.statusCode).toBe(400);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('bounds requested output tokens by the configured maximum', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const app = await makeApp({
      config: {
        deepSeekApiKey: 'bounded-output-test',
        deepSeekMaxTokens: 640,
      },
      fetchImplementation: fetchSpy as unknown as typeof fetch,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { ...loopbackHost, 'content-type': 'application/json' },
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
        maxTokens: 4_096,
        stream: false,
      },
    });
    expect(response.statusCode).toBe(200);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).max_tokens).toBe(640);
  });

  it('returns deterministic backpressure when AI concurrency is exhausted', async () => {
    let completeUpstream!: (response: Response) => void;
    const fetchSpy = vi.fn(() => new Promise<Response>((resolve) => {
      completeUpstream = resolve;
    }));
    const app = await makeApp({
      config: {
        deepSeekApiKey: 'concurrency-test',
        deepSeekMaxConcurrency: 1,
      },
      fetchImplementation: fetchSpy as unknown as typeof fetch,
    });
    const request = {
      method: 'POST' as const,
      url: '/api/ai/chat',
      headers: { ...loopbackHost, 'content-type': 'application/json' },
      payload: { messages: [{ role: 'user', content: 'hello' }], stream: false },
    };
    const first = app.inject(request);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    const second = await app.inject(request);
    expect(second.statusCode).toBe(503);
    expect(second.headers['retry-after']).toBe('2');
    expect(second.json().error.code).toBe('AI_BUSY');

    completeUpstream(new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    expect((await first).statusCode).toBe(200);
  });

  it('removes reasoning content from streamed upstream events', async () => {
    const upstream = [
      'data: {"choices":[{"delta":{"reasoning_content":"hidden thought","content":"Visible analysis."}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    const fetchSpy = vi.fn(async () => new Response(upstream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }));
    const app = await makeApp({
      config: { deepSeekApiKey: 'stream-sanitization-test' },
      fetchImplementation: fetchSpy as unknown as typeof fetch,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { ...loopbackHost, 'content-type': 'application/json' },
      payload: { messages: [{ role: 'user', content: 'hello' }], stream: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.payload).toContain('Visible analysis.');
    expect(response.payload).not.toContain('reasoning_content');
    expect(response.payload).not.toContain('hidden thought');
    expect(response.payload).toContain('data: [DONE]');
  });

  it('caps non-stream and unterminated streamed AI responses', async () => {
    const oversizedJson = JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'x'.repeat(1_100_000) } }],
    });
    const jsonApp = await makeApp({
      config: { deepSeekApiKey: 'response-cap-test' },
      fetchImplementation: vi.fn(async () => new Response(oversizedJson, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch,
    });
    const jsonResponse = await jsonApp.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { ...loopbackHost, 'content-type': 'application/json' },
      payload: { messages: [{ role: 'user', content: 'hello' }], stream: false },
    });
    expect(jsonResponse.statusCode).toBe(502);
    expect(jsonResponse.json().error.code).toBe('AI_RESPONSE_TOO_LARGE');
    expect(jsonResponse.payload.length).toBeLessThan(2_000);

    const streamApp = await makeApp({
      config: { deepSeekApiKey: 'stream-frame-cap-test' },
      fetchImplementation: vi.fn(async () => new Response(`data: ${'y'.repeat(300_000)}`, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })) as unknown as typeof fetch,
    });
    const streamResponse = await streamApp.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { ...loopbackHost, 'content-type': 'application/json' },
      payload: { messages: [{ role: 'user', content: 'hello' }], stream: true },
    });
    expect(streamResponse.statusCode).toBe(200);
    expect(streamResponse.payload).toContain('AI_RESPONSE_TOO_LARGE');
    expect(streamResponse.payload.length).toBeLessThan(2_000);
  });

  it('rejects pathological decimal price strings at the API boundary', async () => {
    const app = await makeApp();
    for (const limitPrice of [`1.${'1'.repeat(13)}`, '9'.repeat(40)]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders',
        headers: { ...loopbackHost, 'content-type': 'application/json' },
        payload: {
          symbol: 'NVDA', side: 'BUY', type: 'LIMIT', quantity: 1,
          timeInForce: 'DAY', limitPrice,
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_ORDER');
    }
  });

  it('rate limits the AI boundary separately from trading endpoints', async () => {
    const app = await makeApp();
    const responses = [];
    for (let index = 0; index < 11; index += 1) {
      responses.push(await app.inject({
        method: 'POST',
        url: '/api/ai/chat',
        headers: { ...loopbackHost, 'content-type': 'application/json' },
        payload: { messages: [{ role: 'user', content: `question ${index}` }], stream: false },
      }));
    }
    expect(responses.slice(0, 10).every((response) => response.statusCode === 200)).toBe(true);
    expect(responses[10].statusCode).toBe(429);
  });
});
