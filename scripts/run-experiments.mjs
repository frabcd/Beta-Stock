import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDirectory = path.join(root, 'artifacts', 'experiments');
fs.mkdirSync(artifactDirectory, { recursive: true });
const experimentRuntime = path.join(root, '.runtime');
for (const directory of [
  path.join(experimentRuntime, 'appdata', 'Roaming'),
  path.join(experimentRuntime, 'appdata', 'Local'),
  path.join(experimentRuntime, 'temp'),
]) fs.mkdirSync(directory, { recursive: true });
const nodeCommand = process.execPath;
const localCli = (...segments) => path.join(root, 'node_modules', ...segments);
const environment = {
  ...process.env,
  BETA_STOCK_ROOT: root,
  BETA_STOCK_STORAGE_POLICY: 'portable',
  BETA_STOCK_DATA_DIR: path.join(root, '.runtime', 'experiment-data'),
  BETA_STOCK_CACHE_DIR: path.join(root, '.cache'),
  BETA_STOCK_RUNTIME_DIR: path.join(root, '.runtime'),
  BETA_STOCK_LOG_DIR: path.join(root, '.logs'),
  npm_config_cache: path.join(root, '.cache', 'npm'),
  PLAYWRIGHT_BROWSERS_PATH: path.join(root, '.cache', 'playwright'),
  XDG_CACHE_HOME: path.join(root, '.cache', 'xdg'),
  APPDATA: path.join(experimentRuntime, 'appdata', 'Roaming'),
  LOCALAPPDATA: path.join(experimentRuntime, 'appdata', 'Local'),
  TEMP: path.join(experimentRuntime, 'temp'),
  TMP: path.join(experimentRuntime, 'temp'),
};
// Experiments must always use the deterministic local AI response, even if a trusted
// development .env exists. Nonempty sentinels also survive Windows PowerShell 5.1.
environment.DEEPSEEK_API_KEY = 'disabled-not-a-secret';
environment.BETA_STOCK_DEEPSEEK_KEY_SOURCE = 'qa-disabled';

const checks = [
  { name: 'lint', command: nodeCommand, args: [localCli('eslint', 'bin', 'eslint.js'), '.'] },
  { name: 'typecheck', command: nodeCommand, args: [localCli('typescript', 'bin', 'tsc'), '-b', '--pretty', 'false'] },
  { name: 'unit-and-integration', command: nodeCommand, args: [localCli('vitest', 'vitest.mjs'), 'run'] },
  { name: 'security', command: nodeCommand, args: [localCli('vitest', 'vitest.mjs'), 'run', '--config', 'tests/security/vitest.config.ts'] },
  { name: 'production-bundle', command: nodeCommand, args: [localCli('vite', 'bin', 'vite.js'), 'build'] },
  {
    name: 'browser-accessibility-visual',
    command: nodeCommand,
    args: [
      localCli('@playwright', 'test', 'cli.js'),
      'test',
      '--config',
      path.join(root, 'tests', 'e2e', 'playwright.qa.config.ts'),
    ],
  },
];
const startedAt = new Date().toISOString();
const results = [];
for (const check of checks) {
  process.stdout.write(`\n[Beta-Stock experiment] ${check.name}\n`);
  const started = Date.now();
  const result = spawnSync(check.command, check.args, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    shell: false,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  results.push({
    name: check.name,
    passed: result.status === 0,
    exitCode: result.status,
    durationMs: Date.now() - started,
    output: output.slice(-20_000),
  });
  if (result.status !== 0) break;
}
const report = {
  startedAt,
  finishedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  passed: results.length === checks.length && results.every((result) => result.passed),
  results,
};
const reportPath = path.join(artifactDirectory, `experiment-${startedAt.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`\nExperiment report: ${reportPath}\n`);
process.exitCode = report.passed ? 0 : 1;
