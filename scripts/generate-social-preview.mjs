import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDirectory = path.join(root, 'docs', 'assets');
const overviewPath = path.join(assetDirectory, 'overview.png');
const outputPath = path.join(assetDirectory, 'social-preview.png');
const profilePath = path.join(root, '.runtime', 'social-preview-edge');
const cachePath = path.join(root, '.cache', 'edge', 'social-preview');

if (!fs.existsSync(overviewPath)) {
  throw new Error(`Final overview screenshot is missing: ${overviewPath}`);
}

fs.mkdirSync(assetDirectory, { recursive: true });
fs.mkdirSync(profilePath, { recursive: true });
fs.mkdirSync(cachePath, { recursive: true });

const screenshotData = fs.readFileSync(overviewPath).toString('base64');
const logo = fs.readFileSync(path.join(root, 'public', 'favicon.svg'), 'utf8');
const context = await chromium.launchPersistentContext(profilePath, {
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  headless: true,
  viewport: { width: 1280, height: 640 },
  colorScheme: 'dark',
  args: [`--disk-cache-dir=${cachePath}`, '--no-first-run', '--disable-default-apps'],
});

try {
  const page = await context.newPage();
  await page.setContent(`<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      html, body { width: 1280px; height: 640px; margin: 0; overflow: hidden; }
      body { color: #f4f7fb; background: #070c13; font-family: "Segoe UI", Arial, sans-serif; }
      .canvas { position: relative; width: 1280px; height: 640px; padding: 64px; overflow: hidden; background:
        radial-gradient(700px 480px at 98% 10%, rgba(60, 109, 213, .25), transparent 68%),
        radial-gradient(500px 360px at 18% 110%, rgba(23, 197, 145, .13), transparent 70%),
        linear-gradient(145deg, #070c13, #0a111d 58%, #080d15); }
      .grid { position: absolute; inset: 0; opacity: .12; background-image: linear-gradient(rgba(138,163,211,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(138,163,211,.14) 1px, transparent 1px); background-size: 48px 48px; mask-image: linear-gradient(90deg, transparent, black 48%, black); }
      .copy { position: relative; z-index: 2; width: 430px; }
      .brand { display: flex; align-items: center; gap: 16px; }
      .logo { width: 58px; height: 58px; display: grid; place-items: center; filter: drop-shadow(0 12px 24px rgba(47,103,220,.3)); }
      .logo svg { width: 58px; height: 58px; }
      .brand strong { font-size: 31px; letter-spacing: -1.1px; }
      .eyebrow { margin-top: 50px; color: #78a0f5; font-size: 13px; font-weight: 750; letter-spacing: 2.1px; text-transform: uppercase; }
      h1 { width: 465px; margin: 14px 0 17px; font-size: 47px; line-height: 1.04; letter-spacing: -2.3px; }
      p { width: 420px; margin: 0; color: #aab7cc; font-size: 18px; line-height: 1.5; }
      .chips { display: flex; gap: 9px; margin-top: 30px; }
      .chip { min-width: 48px; padding: 8px 12px; color: #dce7fb; background: rgba(17,29,47,.88); border: 1px solid rgba(127,154,204,.23); border-radius: 8px; text-align: center; font-size: 12px; font-weight: 700; }
      .mode { display: inline-flex; align-items: center; gap: 8px; margin-top: 17px; color: #8fdac2; font-size: 11px; font-weight: 750; letter-spacing: 1.25px; }
      .mode::before { content: ""; width: 8px; height: 8px; background: #22c99a; border-radius: 50%; box-shadow: 0 0 0 4px rgba(34,201,154,.12); }
      .product { position: absolute; z-index: 2; left: 544px; top: 74px; width: 790px; height: 500px; overflow: hidden; background: #090f18; border: 1px solid rgba(133,161,212,.28); border-radius: 18px; box-shadow: 0 38px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.025) inset; transform: rotate(-1.35deg); }
      .product::before { content: ""; position: absolute; z-index: 2; inset: 0; pointer-events: none; box-shadow: 0 0 0 1px rgba(255,255,255,.04) inset; border-radius: inherit; }
      .product img { width: 100%; height: 100%; display: block; object-fit: cover; object-position: left top; }
      .rule { position: absolute; z-index: 3; right: 64px; bottom: 33px; color: #6e7c92; font-size: 10px; letter-spacing: .7px; }
    </style></head><body><main class="canvas"><div class="grid"></div>
      <section class="copy"><div class="brand"><div class="logo">${logo}</div><strong>Beta-Stock</strong></div>
        <div class="eyebrow">Local-first market simulator</div>
        <h1>Paper trading across three rulebooks.</h1>
        <p>Exact-money accounting, market-aware validation, and an optional server-side research copilot.</p>
        <div class="chips"><span class="chip">US</span><span class="chip">HK</span><span class="chip">CN</span></div>
        <div class="mode">SYNTHETIC PAPER TRADING</div>
      </section>
      <div class="product"><img alt="Beta-Stock overview" src="data:image/png;base64,${screenshotData}"></div>
      <div class="rule">Educational simulation · no real-money routing</div>
    </main></body></html>`, { waitUntil: 'load' });
  await page.locator('.canvas').screenshot({ path: outputPath, type: 'png', animations: 'disabled' });
} finally {
  await context.close();
}

const size = fs.statSync(outputPath).size;
if (size >= 1_000_000) {
  throw new Error(`Social preview is ${(size / 1_000_000).toFixed(2)} MB; it must stay below 1 MB.`);
}
process.stdout.write(`Created ${outputPath} (${size.toLocaleString('en-US')} bytes)\n`);
