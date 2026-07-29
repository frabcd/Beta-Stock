import { test, expect } from '@playwright/test';
import { openRoute, qaPath, routes } from './helpers';

test('the product favicon is emitted as an SVG asset', async ({ request }) => {
  const response = await request.get('/favicon.svg');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toMatch(/image\/svg\+xml/i);
  expect(await response.text()).toContain('<svg');
});

test.describe('paper-trading trust and lifecycle hard gates', () => {
  test.afterEach(async ({ request }, testInfo) => {
    if (!testInfo.title.includes('ticket reviews before submit')) return;
    const reset = await request.post('/api/reset');
    expect(reset.ok(), 'QA cleanup could not restore the deterministic paper account').toBe(true);
  });

  test('ticket reviews before submit, rejects invalid lots, and persists a working order that can cancel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'single desktop lifecycle audit');
    await openRoute(page, routes[2]);

    const quantity = page.getByRole('textbox', { name: 'Quantity' });
    await quantity.fill('20');
    await page.getByTestId('order-review').click();
    const review = page.getByTestId('order-review-panel');
    await expect(review, 'Review must be a distinct confirmation step; clicking Review must not submit').toBeVisible();
    await expect(review).toContainText(/NVDA/);
    await expect(review).toContainText(/USD|US\$/);
    await expect(review).toContainText(/simulated|paper/i);
    await review.getByTestId('order-confirm').click();
    await expect(page.getByTestId('order-result')).toContainText(/pending|accepted|partial|filled/i);

    await page.goto('/trade/300750');
    await page.locator('.trade-page').waitFor();
    await page.getByRole('textbox', { name: 'Quantity' }).fill('1');
    await page.getByTestId('order-review').click();
    await page.getByTestId('order-confirm').click();
    await expect(page.getByTestId('order-result')).toContainText(/minimum.*100|board lot|lot size|multiple of 100/i);

    await page.goto('/trade/0700');
    await page.locator('.trade-page').waitFor();
    await page.getByRole('textbox', { name: 'Quantity' }).fill('100');
    // Keep the buy well below the synthetic quote so it persists in a cancellable working state.
    await page.getByRole('textbox', { name: /limit price/i }).fill('100');
    await page.getByTestId('order-review').click();
    await page.getByTestId('order-confirm').click();
    await expect(page.getByTestId('order-result')).toContainText(/pending|accepted|working/i);
    await page.goto('/orders');
    const row = page.locator('.orders-table .table-row').filter({ hasText: '0700' }).filter({ has: page.locator('[data-testid^="cancel-order-"]') }).first();
    await expect(row).toContainText(/pending|accepted|working/i);
    const cancel = row.getByRole('button', { name: 'Cancel', exact: true });
    await expect(cancel).toBeVisible();
    await cancel.click();
    const cancelDialog = page.getByRole('dialog', { name: /cancel.*order/i });
    await cancelDialog.getByRole('button', { name: /confirm cancel/i }).click();
    await expect(cancelDialog).toBeHidden();
    const cancelledRow = page.locator('.orders-table .table-row').filter({ hasText: '0700' }).first();
    await expect(cancelledRow).toContainText(/cancelled/i);
    await expect(cancelledRow.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
    await page.screenshot({ path: qaPath('current', 'order-cancelled.png'), animations: 'disabled' });
  });

  test('all order lifecycle states are explained and distinguishable', async ({ page }) => {
    await openRoute(page, routes[4]);
    const surface = page.locator('.orders-page');
    for (const status of ['Pending', 'Accepted', 'Partial', 'Filled', 'Cancelled', 'Rejected']) {
      await expect(surface, `order lifecycle is missing ${status}`).toContainText(new RegExp(status, 'i'));
    }
  });

  test('destructive simulator reset requires explicit confirmation', async ({ page }) => {
    await page.goto('/');
    const reset = page.getByRole('button', { name: /reset.*(simulator|account|portfolio)/i });
    await expect(reset).toBeVisible();
    let resetCalls = 0;
    page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/reset') resetCalls += 1; });
    await reset.click();
    expect(resetCalls, 'reset fired before confirmation').toBe(0);
    const dialog = page.getByRole('dialog', { name: /reset/i });
    await expect(dialog).toContainText(/cannot be undone|clear|restore/i);
    await dialog.getByRole('button', { name: /cancel|keep/i }).click();
    expect(resetCalls, 'cancel still reset data').toBe(0);
  });

  test('data classification, currency, exchange timezone, session, and age are explicit', async ({ page }) => {
    for (const route of [routes[0], routes[1], routes[2], routes[3], routes[4], routes[5]]) {
      await openRoute(page, route);
      const text = await page.locator(route.marker).innerText();
      expect(text, `${route.name}: missing synthetic/simulated classification`).toMatch(/SYNTHETIC|SIMULATED/i);
      expect(text, `${route.name}: missing data age/as-of context`).toMatch(/as of|updated|ago|delay|timestamp/i);
    }
    await page.goto('/trade/NVDA');
    await expect(page.locator('.trade-page')).toContainText(/USD/);
    await expect(page.locator('.trade-page')).toContainText(/ET|New York|America\/New_York/);
    await expect(page.locator('.trade-page')).toContainText(/pre-market|regular session|after-hours|closed/i);
    await page.goto('/trade/0700');
    await expect(page.locator('.trade-page')).toContainText(/HKD/);
    await expect(page.locator('.trade-page')).toContainText(/HKT|Hong Kong|Asia\/Hong_Kong/);
    await page.goto('/trade/300750');
    await expect(page.locator('.trade-page')).toContainText(/CNY/);
    await expect(page.locator('.trade-page')).toContainText(/CST|Shanghai|Asia\/Shanghai/);
  });
});

test('mobile trade sheet supports review and does not hide content below the viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390', 'mobile-only ticket flow');
  await page.goto('/trade/NVDA');
  await page.locator('.mobile-trade-bar').getByRole('button', { name: 'Buy' }).click();
  const dialog = page.getByRole('dialog', { name: /trade NVDA/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/USD|US\$/);
  const viewport = page.viewportSize();
  let lastBox = await dialog.boundingBox();
  await expect.poll(async () => {
    lastBox = await dialog.boundingBox();
    return Boolean(lastBox && viewport && lastBox.y >= -1 && lastBox.y + lastBox.height <= viewport.height + 1);
  }, { message: `mobile ticket clips after animation settles: ${JSON.stringify({ box: lastBox, viewport })}` }).toBe(true);
  await dialog.getByTestId('order-review').click();
  await expect(dialog.getByTestId('order-review-panel')).toBeVisible();
  await expect(dialog.getByTestId('order-confirm')).toBeVisible();
});
