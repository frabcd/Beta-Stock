import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.env.BETA_STOCK_ROOT ?? fileURLToPath(new URL('..', import.meta.url)));
const env = {
  ...process.env,
  BETA_STOCK_ROOT: process.env.BETA_STOCK_ROOT ?? root,
  BETA_STOCK_STORAGE_POLICY: process.env.BETA_STOCK_STORAGE_POLICY ?? 'portable',
  BETA_STOCK_DATA_DIR: process.env.BETA_STOCK_DATA_DIR ?? path.join(root, '.data'),
  BETA_STOCK_CACHE_DIR: process.env.BETA_STOCK_CACHE_DIR ?? path.join(root, '.cache'),
  BETA_STOCK_RUNTIME_DIR: process.env.BETA_STOCK_RUNTIME_DIR ?? path.join(root, '.runtime'),
  BETA_STOCK_LOG_DIR: process.env.BETA_STOCK_LOG_DIR ?? path.join(root, '.logs'),
  npm_config_cache: process.env.npm_config_cache ?? path.join(root, '.cache/npm'),
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(root, '.cache/playwright'),
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? path.join(root, '.cache/xdg'),
  APPDATA: path.join(root, '.runtime/appdata/Roaming'),
  LOCALAPPDATA: path.join(root, '.runtime/appdata/Local'),
  TEMP: path.join(root, '.runtime/temp'),
  TMP: path.join(root, '.runtime/temp'),
  // The production server trusts only its own origin by default. Development opts in
  // to Vite's loopback origin explicitly; a caller can provide a narrower list.
  BETA_STOCK_ALLOWED_ORIGINS: process.env.BETA_STOCK_ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173',
};

for (const directory of [
  env.BETA_STOCK_DATA_DIR,
  env.BETA_STOCK_CACHE_DIR,
  env.BETA_STOCK_RUNTIME_DIR,
  env.BETA_STOCK_LOG_DIR,
  env.npm_config_cache,
  env.PLAYWRIGHT_BROWSERS_PATH,
  env.XDG_CACHE_HOME,
  env.APPDATA,
  env.LOCALAPPDATA,
  env.TEMP,
]) fs.mkdirSync(directory, { recursive: true });

const tsxPackage = path.join(root, 'node_modules', 'tsx', 'package.json');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
for (const entry of [tsxPackage, viteCli]) {
  if (!fs.existsSync(entry)) throw new Error(`Missing local development runtime: ${entry}`);
}

const children = [
  spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: root, env, stdio: 'inherit' }),
  spawn(process.execPath, [viteCli, '--host', '127.0.0.1'], { cwd: root, env, stdio: 'inherit' }),
];

let closing = false;
const stop = (code = 0) => {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exitCode = code;
};

for (const child of children) {
  child.once('exit', (code, signal) => {
    if (!closing) {
      console.error(`Beta-Stock development service exited (${signal ?? code}).`);
      stop(code ?? 1);
    }
  });
  child.once('error', (error) => {
    if (!closing) {
      console.error(`Beta-Stock development service could not start: ${error.message}`);
      stop(1);
    }
  });
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
