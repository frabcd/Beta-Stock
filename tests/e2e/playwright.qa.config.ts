import path from 'node:path';
import { defineConfig } from '@playwright/test';

const root = path.resolve(process.env.BETA_STOCK_ROOT ?? process.cwd());
const runId = process.env.BETA_QA_RUN_ID ?? `run-${process.pid}`;
const cache = path.join(root, '.cache', 'edge', runId);

export default defineConfig({
  testDir: '.',
  // A unique directory avoids Windows/Edge handle races when a prior failed run is still releasing traces.
  outputDir: path.join(root, 'artifacts', 'qa', 'runs', runId),
  snapshotPathTemplate: path.join(root, 'tests', 'e2e', '__screenshots__', '{arg}{ext}'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // Keep a generous process ceiling for the removable exFAT workspace; app-level
  // assertions retain their tighter explicit timeouts below this ceiling.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'msedge',
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'Asia/Hong_Kong',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: {
      args: [`--disk-cache-dir=${cache}`, '--no-first-run', '--disable-default-apps'],
    },
  },
  projects: [
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-1366', use: { viewport: { width: 1366, height: 768 } } },
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'node --import tsx server/index.ts',
    cwd: root,
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      BETA_STOCK_ROOT: root,
      BETA_STOCK_STORAGE_POLICY: 'portable',
      BETA_STOCK_DATA_DIR: path.join(root, '.data', 'qa', runId),
      BETA_STOCK_CACHE_DIR: path.join(root, '.cache'),
      BETA_STOCK_RUNTIME_DIR: path.join(root, '.runtime', 'qa', runId),
      BETA_STOCK_LOG_DIR: path.join(root, '.logs', 'qa', runId),
      DEEPSEEK_API_KEY: 'disabled-not-a-secret',
      BETA_STOCK_DEEPSEEK_KEY_SOURCE: 'qa-disabled',
      APPDATA: path.join(root, '.runtime', 'qa', runId, 'appdata', 'Roaming'),
      LOCALAPPDATA: path.join(root, '.runtime', 'qa', runId, 'appdata', 'Local'),
      TEMP: path.join(root, '.runtime', 'qa', runId, 'temp'),
      TMP: path.join(root, '.runtime', 'qa', runId, 'temp'),
      npm_config_cache: path.join(root, '.cache', 'npm'),
      PLAYWRIGHT_BROWSERS_PATH: path.join(root, '.cache', 'playwright'),
      XDG_CACHE_HOME: path.join(root, '.cache', 'xdg'),
    },
  },
});
