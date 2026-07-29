import path from 'node:path';
import { defineConfig } from '@playwright/test';

const projectRoot = path.resolve(process.env.BETA_STOCK_ROOT ?? process.cwd());
const useSystemEdge = process.platform === 'win32'
  && (!process.env.CI || process.env.BETA_STOCK_USE_EDGE === '1');
const localEdge = useSystemEdge ? { channel: 'msedge' as const } : {};

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: path.join(projectRoot, 'artifacts/e2e/results'),
  snapshotPathTemplate: path.join(projectRoot, 'tests/e2e/__screenshots__/{arg}{ext}'),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(projectRoot, 'artifacts/e2e/report'), open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    ...localEdge,
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'Asia/Hong_Kong',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-1366', use: { viewport: { width: 1366, height: 768 } } },
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...localEdge } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      BETA_STOCK_DATA_DIR: path.join(projectRoot, '.data/e2e'),
      BETA_STOCK_TEST_MODE: '1',
      DEEPSEEK_API_KEY: 'disabled-not-a-secret',
      BETA_STOCK_DEEPSEEK_KEY_SOURCE: 'qa-disabled',
      PLAYWRIGHT_BROWSERS_PATH: path.join(projectRoot, '.cache/playwright'),
      npm_config_cache: path.join(projectRoot, '.cache/npm'),
    },
  },
});
