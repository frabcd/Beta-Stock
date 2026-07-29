import path from 'node:path';
import process from 'node:process';

const DEFAULT_PORT = 4173;

export type StoragePolicy = 'portable' | 'strict-e';

export interface ServerConfig {
  readonly rootDir: string;
  readonly dataDir: string;
  readonly cacheDir: string;
  readonly runtimeDir: string;
  readonly logDir: string;
  readonly storagePolicy: StoragePolicy;
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly deepSeekApiKey?: string;
  readonly deepSeekModel: string;
  readonly deepSeekAllowedModels: ReadonlySet<string>;
  readonly deepSeekTimeoutMs: number;
  readonly deepSeekMaxTokens: number;
  readonly deepSeekMaxConcurrency: number;
  readonly isTest: boolean;
}

export interface ConfigOverrides {
  readonly rootDir?: string;
  readonly dataDir?: string;
  readonly cacheDir?: string;
  readonly runtimeDir?: string;
  readonly logDir?: string;
  readonly storagePolicy?: StoragePolicy;
  readonly port?: number;
  readonly allowedOrigins?: readonly string[];
  readonly deepSeekApiKey?: string;
  readonly deepSeekModel?: string;
  readonly deepSeekAllowedModels?: readonly string[];
  readonly deepSeekTimeoutMs?: number;
  readonly deepSeekMaxTokens?: number;
  readonly deepSeekMaxConcurrency?: number;
  readonly isTest?: boolean;
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) return fallback;
  return parsed;
}

function boundedOverride(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(`${label} must be a positive integer no greater than ${maximum}.`);
  }
  return value;
}

function storagePolicy(value: string | undefined): StoragePolicy {
  if (value === undefined || value === '' || value === 'portable') return 'portable';
  if (value === 'strict-e') return 'strict-e';
  throw new Error('BETA_STOCK_STORAGE_POLICY must be portable or strict-e.');
}

function assertStrictE(rootDir: string, policy: StoragePolicy): void {
  if (policy !== 'strict-e') return;
  if (process.platform !== 'win32') {
    throw new Error('The strict-e storage policy is available only on Windows.');
  }
  if (path.parse(rootDir).root.toUpperCase() !== 'E:\\') {
    throw new Error('BETA_STOCK_ROOT must be located on the E: drive under strict-e policy.');
  }
}

function resolveWritablePath(rootDir: string, candidate: string, label: string): string {
  const resolved = path.resolve(candidate);
  const relative = path.relative(rootDir, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must remain within BETA_STOCK_ROOT.`);
  }
  return resolved;
}

function cleanModelList(values: readonly string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter((value) => /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value));
}

function normalizeOrigin(value: string): string | null {
  try {
    const origin = new URL(value);
    if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1') return null;
    if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
      return null;
    }
    return origin.origin;
  } catch {
    return null;
  }
}

export function loadConfig(overrides: ConfigOverrides = {}): ServerConfig {
  const rootDir = path.resolve(overrides.rootDir ?? process.env.BETA_STOCK_ROOT ?? process.cwd());
  const selectedStoragePolicy = storagePolicy(
    overrides.storagePolicy ?? process.env.BETA_STOCK_STORAGE_POLICY,
  );
  assertStrictE(rootDir, selectedStoragePolicy);
  const port = overrides.port ?? positiveInteger(process.env.BETA_STOCK_PORT, DEFAULT_PORT, 65_535);
  const environmentOrigins = process.env.BETA_STOCK_ALLOWED_ORIGINS?.split(',') ?? [];
  const allowedOrigins = new Set(
    [
      `http://127.0.0.1:${port}`,
      ...(overrides.allowedOrigins ?? environmentOrigins),
    ]
      .map(normalizeOrigin)
      .filter((origin): origin is string => origin !== null),
  );

  const requestedAllowedModels = cleanModelList(
    overrides.deepSeekAllowedModels
      ?? process.env.DEEPSEEK_ALLOWED_MODELS?.split(',')
      ?? ['deepseek-v4-flash', 'deepseek-v4-pro'],
  );
  const allowedModels = new Set(
    requestedAllowedModels.length > 0 ? requestedAllowedModels : ['deepseek-v4-flash'],
  );
  const requestedModel = overrides.deepSeekModel ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash';
  const deepSeekModel = allowedModels.has(requestedModel)
    ? requestedModel
    : [...allowedModels][0] ?? 'deepseek-v4-flash';

  return {
    rootDir,
    dataDir: resolveWritablePath(
      rootDir,
      overrides.dataDir ?? process.env.BETA_STOCK_DATA_DIR ?? path.join(rootDir, '.data'),
      'BETA_STOCK_DATA_DIR',
    ),
    cacheDir: resolveWritablePath(
      rootDir,
      overrides.cacheDir ?? process.env.BETA_STOCK_CACHE_DIR ?? path.join(rootDir, '.cache'),
      'BETA_STOCK_CACHE_DIR',
    ),
    runtimeDir: resolveWritablePath(
      rootDir,
      overrides.runtimeDir ?? process.env.BETA_STOCK_RUNTIME_DIR ?? path.join(rootDir, '.runtime'),
      'BETA_STOCK_RUNTIME_DIR',
    ),
    logDir: resolveWritablePath(
      rootDir,
      overrides.logDir ?? process.env.BETA_STOCK_LOG_DIR ?? path.join(rootDir, '.logs'),
      'BETA_STOCK_LOG_DIR',
    ),
    storagePolicy: selectedStoragePolicy,
    host: '127.0.0.1',
    port,
    allowedOrigins,
    // Inherited shell variables are intentionally ignored. A developer must explicitly mark
    // .env as trusted with BETA_STOCK_DEEPSEEK_KEY_SOURCE=env; the Windows launcher uses dpapi.
    // Tests may inject an explicit override in memory.
    deepSeekApiKey: overrides.deepSeekApiKey
      ?? (['dpapi', 'env'].includes(process.env.BETA_STOCK_DEEPSEEK_KEY_SOURCE ?? '')
        ? process.env.DEEPSEEK_API_KEY
        : undefined),
    deepSeekModel,
    deepSeekAllowedModels: allowedModels,
    deepSeekTimeoutMs:
      overrides.deepSeekTimeoutMs
      ?? positiveInteger(process.env.DEEPSEEK_TIMEOUT_MS, 25_000, 60_000),
    deepSeekMaxTokens: boundedOverride(
      overrides.deepSeekMaxTokens,
      positiveInteger(process.env.DEEPSEEK_MAX_TOKENS, 1_200, 4_096),
      4_096,
      'DEEPSEEK_MAX_TOKENS',
    ),
    deepSeekMaxConcurrency: boundedOverride(
      overrides.deepSeekMaxConcurrency,
      positiveInteger(process.env.DEEPSEEK_MAX_CONCURRENCY, 2, 8),
      8,
      'DEEPSEEK_MAX_CONCURRENCY',
    ),
    isTest: overrides.isTest ?? process.env.NODE_ENV === 'test',
  };
}

export function isAllowedLoopbackOrigin(origin: string | undefined, config: ServerConfig): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  return normalized !== null && config.allowedOrigins.has(normalized);
}

export function isAllowedLoopbackHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false;
  return hostHeader === `127.0.0.1:${port}` || (port === 80 && hostHeader === '127.0.0.1');
}
