import { test, expect } from '@playwright/test';
import { openRoute, qaPath, routes } from './helpers';

test('navigation, command palette, theme, and gain convention are functional', async ({ page }, testInfo) => {
  await page.goto('/');
  const destinations = [
    ['Markets', '/markets'],
    ['Trade', '/trade/NVDA'],
    ['Portfolio', '/portfolio'],
    ['Orders', '/orders'],
    ['AI Lab', '/ai-lab'],
    ['Overview', '/'],
  ] as const;
  for (const [name, path] of destinations) {
    const link = page.getByRole('link', { name, exact: true }).first();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : path.replace('/', '\\/')}$`));
  }

  await page.keyboard.press('Control+K');
  const search = page.getByRole('textbox', { name: 'Search' });
  await search.fill('Tencent');
  await page.getByRole('button', { name: /0700.*Tencent/i }).click();
  await expect(page).toHaveURL(/\/trade\/0700$/);

  if (testInfo.project.name === 'mobile-390') {
    await page.locator('.trade-page').waitFor({ state: 'visible' });
    await expect(page.locator('.trade-page .skeleton-row')).toHaveCount(0, { timeout: 15_000 });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: qaPath('current', 'mobile-navigation.png'), animations: 'disabled' });
    return;
  }

  const settings = page.getByRole('button', { name: /appearance and market preferences/i });
  await settings.click();
  await page.getByRole('button', { name: /light/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const redGain = page.getByRole('menuitem', { name: /red is gain/i });
  // Theme selection intentionally keeps the appearance menu open. Re-open it only
  // if the responsive shell closed it, rather than clicking through its overlay.
  if (!(await redGain.isVisible())) await settings.click();
  await redGain.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('beta-stock-gain'))).toBe('red-up');
  const greenGain = page.getByRole('menuitem', { name: /green is gain/i });
  if (!(await greenGain.isVisible())) await settings.click();
  await greenGain.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('beta-stock-gain'))).toBe('green-up');
  await page.keyboard.press('Escape');
  await page.goto('/');
  await page.locator('.overview-page').waitFor();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: qaPath('current', 'state-light-theme-overview.png'), animations: 'disabled', fullPage: true });
});

test('markets controls and linked security context are not inert', async ({ page }) => {
  await openRoute(page, routes[1]);
  const tabs = page.locator('.markets-toolbar [role="tab"]');
  expect(await tabs.count()).toBeGreaterThanOrEqual(3);
  for (const label of ['United States', 'Hong Kong', 'Mainland China']) {
    const tab = tabs.filter({ hasText: label }).first();
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
  const security = page.getByRole('button', { name: /Tencent|0700/ }).first();
  await security.click();
  await expect(page).toHaveURL(/\/trade\/0700$/);
});

test('trade chart ranges and display modes are functional and truthfully labelled', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'single desktop chart-control audit');
  await openRoute(page, routes[2]);
  const chart = page.locator('.chart-card');
  await expect(chart).toContainText('1D bars');
  const tradingViewAttribution = chart.locator('a[href*="tradingview.com"]');
  await expect(tradingViewAttribution, 'The required TradingView chart attribution must remain visible and linked').toBeVisible();

  const ema = chart.getByRole('button', { name: /toggle EMA 20 indicator/i });
  await expect(ema).toHaveAttribute('aria-pressed', 'true');
  await expect(chart.locator('.chart-ema-readout')).toContainText(/EMA20/i);
  await ema.click();
  await expect(ema).toHaveAttribute('aria-pressed', 'false');
  await expect(chart.locator('.chart-ema-readout')).toHaveCount(0);
  await ema.click();
  await expect(ema).toHaveAttribute('aria-pressed', 'true');

  const fiveDay = chart.getByRole('button', { name: '5D', exact: true });
  const oneMonth = chart.getByRole('button', { name: '1M', exact: true });
  const sixWeeks = chart.getByRole('button', { name: '6W', exact: true });
  await expect(sixWeeks).toHaveAttribute('aria-pressed', 'true');
  await fiveDay.click();
  await expect(fiveDay).toHaveAttribute('aria-pressed', 'true');
  await expect(sixWeeks).toHaveAttribute('aria-pressed', 'false');
  await oneMonth.click();
  await expect(oneMonth).toHaveAttribute('aria-pressed', 'true');

  const candles = chart.getByTitle('Candlesticks');
  const area = chart.getByTitle('Area chart');
  await expect(candles).toHaveClass(/active/);
  await area.click();
  await expect(area).toHaveClass(/active/);
  await expect(candles).not.toHaveClass(/active/);
  await candles.click();
  await expect(candles).toHaveClass(/active/);

  const plot = chart.locator('.financial-chart-canvas');
  const plotBox = await plot.boundingBox();
  expect(plotBox).not.toBeNull();
  await page.mouse.move(plotBox!.x + plotBox!.width * .58, plotBox!.y + plotBox!.height * .42);
  const inspection = chart.locator('.chart-crosshair-card');
  await expect(inspection).toBeVisible();
  await expect(inspection).toContainText(/inspect/i);
  await expect(inspection).toContainText(/open/i);
  await expect(inspection).toContainText(/est\. volume/i);
  await page.screenshot({ path: qaPath('current', 'trade-chart-interaction.png'), animations: 'disabled' });

  const resetView = chart.getByRole('button', { name: /reset chart view/i });
  await expect(resetView).toBeEnabled();
  await page.mouse.wheel(0, -420);
  await resetView.click();
  await expect(chart.locator('.chart-gesture-hint')).toContainText(/drag to pan/i);
  await expect(chart.locator('.chart-gesture-hint')).toContainText(/zoom/i);
});

test('AI demo uses the server stream and exposes provenance and limitations', async ({ page }, testInfo) => {
  const health = await page.request.get('/api/health');
  expect(health.ok()).toBe(true);
  const mode = (await health.json() as { aiMode: string }).aiMode;
  await openRoute(page, routes[5]);
  if (mode === 'deterministic-demo') {
    await expect(page.locator('.ai-page')).toContainText(/demo|deterministic/i);
    await expect(page.locator('.ai-page')).not.toContainText(/DeepSeek\s+Ready/i);
  }

  const responses: Array<{ status: number; type: string }> = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/ai/chat') {
      responses.push({ status: response.status(), type: response.headers()['content-type'] ?? '' });
    }
  });
  const composer = page.locator('.ai-composer textarea');
  await composer.fill('Stress-test my portfolio and cite the data age.');
  await page.locator('.send-button').click();
  await expect(page.locator('.assistant-message')).toBeVisible();
  await expect(page.locator('.assistant-message')).toContainText(/synthetic|simulated/i);
  await expect(page.locator('.assistant-message')).toContainText(/source|as of|data age|updated/i);
  await expect.poll(() => responses.length, { timeout: 12_000 }).toBeGreaterThan(0);
  expect(responses.some((response) => response.status === 200 && /text\/event-stream/i.test(response.type)), JSON.stringify(responses)).toBe(true);
  await expect(page.getByRole('button', { name: 'Copy response' })).toBeVisible();
  const evidence = page.getByTestId('ai-evidence-deck');
  await expect(evidence).toContainText('Trace every factual claim');
  await expect(page.getByTestId('ai-evidence-s1')).toContainText('SYNTHETIC');
  await expect(page.getByTestId('ai-evidence-s1')).toContainText(/not proof.*fresh or live/i);
  await expect(page.getByTestId('ai-evidence-s2')).toContainText(/net equity|positions/i);
  const citationTargets = await page.locator('.safe-citation').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(citationTargets.length).toBeGreaterThan(1);
  expect(citationTargets.every((target) => /^#ai-evidence-s[12]$/.test(target ?? '')), JSON.stringify(citationTargets)).toBe(true);
  const chat = page.locator('.ai-chat');
  await chat.evaluate((element) => { element.scrollTop = 0; });
  const answerPath = qaPath('current', `ai-answer-${testInfo.project.name}.png`);
  await page.screenshot({ path: answerPath, animations: 'disabled' });
  if (testInfo.project.name === 'desktop-1440') {
    await page.screenshot({ path: qaPath('current', 'ai-answer.png'), animations: 'disabled' });
  }
  await page.getByRole('link', { name: 'View submitted evidence S1' }).first().click();
  await expect(page).toHaveURL(/#ai-evidence-s1$/);
  await evidence.scrollIntoViewIfNeeded();
  await page.screenshot({ path: qaPath('current', `ai-evidence-${testInfo.project.name}.png`), animations: 'disabled' });
});
