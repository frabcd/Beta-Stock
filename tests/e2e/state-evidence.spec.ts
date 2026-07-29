import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { openRoute, qaPath, routes } from './helpers';

test.describe('review evidence for non-default product states', () => {
  test.afterEach(async ({ request }, testInfo) => {
    if (testInfo.project.name !== 'desktop-1440') return;
    if (!/working-to-cancel lifecycle|filled and partial execution/i.test(testInfo.title)) return;
    const reset = await request.post('/api/reset');
    expect(reset.ok(), 'Evidence capture could not restore the deterministic paper account').toBe(true);
  });

  test('captures US review, Mainland rejection, and Hong Kong working-to-cancel lifecycle', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'single deterministic desktop evidence run');

    await openRoute(page, routes[2]);
    await page.getByRole('textbox', { name: 'Quantity' }).fill('20');
    await page.getByTestId('order-review').click();
    const usReview = page.getByTestId('order-review-panel');
    await expect(usReview).toContainText(/NVDA/);
    await expect(usReview).toContainText(/USD/);
    await page.screenshot({ path: qaPath('current', 'state-order-review-us.png'), animations: 'disabled' });

    await page.goto('/trade/300750');
    await page.locator('.trade-page').waitFor();
    await page.getByRole('textbox', { name: 'Quantity' }).fill('1');
    await page.getByTestId('order-review').click();
    await page.getByTestId('order-confirm').click();
    const rejection = page.getByTestId('order-result');
    await expect(rejection).toContainText(/rejected/i);
    await expect(rejection).toContainText(/100|board lot|lot size|multiple/i);
    await expect.poll(async () => rejection.evaluate((element) => element.clientHeight >= element.scrollHeight - 1), {
      message: 'Rejected-order explanation remained visually clipped after its transition',
    }).toBe(true);
    await page.screenshot({ path: qaPath('current', 'state-order-rejected-cn.png'), animations: 'disabled' });

    await page.goto('/trade/0700');
    await page.locator('.trade-page').waitFor();
    await page.getByRole('textbox', { name: 'Quantity' }).fill('100');
    await page.getByRole('textbox', { name: /limit price/i }).fill('100');
    await page.getByTestId('order-review').click();
    await page.getByTestId('order-confirm').click();
    const hkResult = page.getByTestId('order-result');
    await expect(hkResult).toContainText(/pending|accepted|working/i);
    await expect.poll(async () => hkResult.evaluate((element) => element.clientHeight >= element.scrollHeight - 1), {
      message: 'Working-order lifecycle remained visually clipped after its transition',
    }).toBe(true);

    const chartContext = page.locator('.chart-position-context');
    await expect(chartContext).toContainText(/200 sh @ 380\.00 HKD/i);
    await expect(chartContext).toContainText(/1 working/i);
    await page.screenshot({ path: qaPath('current', 'state-chart-position-order-hk.png'), animations: 'disabled' });

    await page.goto('/orders');
    await page.locator('.orders-page').waitFor();
    const hkRow = page.locator('.orders-table .table-row').filter({ hasText: '0700' }).first();
    await expect(hkRow).toContainText(/pending|accepted|working/i);
    const workingA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(workingA11y.violations, `Working-order state accessibility: ${JSON.stringify(workingA11y.violations, null, 2)}`).toEqual([]);
    await page.screenshot({ path: qaPath('current', 'state-orders-hk-working.png'), animations: 'disabled' });

    await hkRow.getByRole('button', { name: 'Cancel', exact: true }).click();
    const cancelDialog = page.getByRole('dialog', { name: /cancel.*order/i });
    await expect(cancelDialog).toContainText(/0700/);
    await page.screenshot({ path: qaPath('current', 'state-order-cancel-confirmation-hk.png'), animations: 'disabled' });
    await cancelDialog.getByRole('button', { name: /confirm cancel/i }).click();
    await expect(cancelDialog).toBeHidden();
    await expect(hkRow).toContainText(/cancelled/i);
    await expect(hkRow.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
    await page.screenshot({ path: qaPath('current', 'state-orders-hk-cancelled.png'), animations: 'disabled' });
  });

  test('captures filled and partial execution outcomes from the deterministic engine', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'single deterministic desktop evidence run');

    const snapshotResponse = await page.request.get('/api/snapshots/NVDA');
    expect(snapshotResponse.ok()).toBe(true);
    const snapshot = await snapshotResponse.json() as { quote: { askSize: number } };
    expect(snapshot.quote.askSize).toBeGreaterThan(0);

    await page.goto('/trade/NVDA');
    await page.locator('.trade-page').waitFor();
    const ticket = page.getByTestId('order-ticket');
    await ticket.getByLabel('Order type').selectOption('Market');
    await ticket.getByRole('textbox', { name: 'Quantity' }).fill('1');
    await ticket.getByTestId('order-review').click();
    await ticket.getByTestId('order-confirm').click();
    await expect(ticket.getByTestId('order-result')).toContainText(/filled/i);

    await ticket.getByRole('textbox', { name: 'Quantity' }).fill(String(snapshot.quote.askSize + 3));
    await ticket.getByTestId('order-review').click();
    await ticket.getByTestId('order-confirm').click();
    await expect(ticket.getByTestId('order-result')).toContainText(/partial/i);

    await page.goto('/orders');
    await page.locator('.orders-page').waitFor();
    const nvdaRows = page.locator('.orders-table .table-row').filter({ hasText: 'NVDA' });
    await expect(nvdaRows.locator('.status-blue').filter({ hasText: /partially filled/i })).toHaveCount(1);
    await expect(nvdaRows.locator('.status-good').filter({ hasText: /filled/i })).toHaveCount(1);
    await page.screenshot({ path: qaPath('current', 'state-orders-filled-partial.png'), animations: 'disabled' });
  });

  test('captures loading and disconnected service states truthfully', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'single deterministic desktop evidence run');

    let releasePortfolio!: () => void;
    const portfolioGate = new Promise<void>((resolve) => { releasePortfolio = resolve; });
    await page.route('**/api/portfolio', async (route) => {
      await portfolioGate;
      await route.continue();
    });
    await page.goto('/portfolio');
    const loading = page.locator('.portfolio-page .loading-state, .page > .loading-state').first();
    await expect(loading).toBeVisible();
    await page.screenshot({ path: qaPath('current', 'state-loading-portfolio.png'), animations: 'disabled' });
    releasePortfolio();
    await page.unrouteAll({ behavior: 'wait' });
    await page.locator('.portfolio-page').waitFor();

    await page.route('**/api/**', (route) => route.abort('connectionrefused'));
    await page.goto('/portfolio');
    await expect(page.locator('.state-panel[role="alert"]')).toContainText(/unable to refresh|temporarily unavailable/i, { timeout: 20_000 });
    await expect(page.getByTestId('service-status')).toContainText(/offline/i, { timeout: 20_000 });
    await page.screenshot({ path: qaPath('current', 'state-disconnected-portfolio.png'), animations: 'disabled' });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('captures both Asian market rule lenses', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'single deterministic desktop evidence run');
    await openRoute(page, routes[1]);
    const hongKong = page.locator('.markets-toolbar [role="tab"]').filter({ hasText: 'Hong Kong' }).first();
    await hongKong.click();
    await expect(hongKong).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.market-rule-lens')).toContainText(/HKD|board lot|tick/i);
    await page.screenshot({ path: qaPath('current', 'state-markets-hk-rules.png'), animations: 'disabled', fullPage: true });

    const mainland = page.locator('.markets-toolbar [role="tab"]').filter({ hasText: 'Mainland China' }).first();
    await mainland.click();
    await expect(mainland).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.market-rule-lens')).toContainText(/CNY|board lot|tick|T\+1/i);
    await page.screenshot({ path: qaPath('current', 'state-markets-cn-rules.png'), animations: 'disabled', fullPage: true });
  });

  test('captures mobile order review and horizontally explored positions', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'mobile-only evidence run');

    await page.goto('/trade/NVDA');
    await page.locator('.trade-page').waitFor();
    await page.locator('.mobile-trade-bar').getByRole('button', { name: 'Buy' }).click();
    const ticket = page.getByRole('dialog', { name: /trade NVDA/i });
    await ticket.getByTestId('order-review').click();
    await expect(ticket.getByTestId('order-review-panel')).toContainText(/USD/);
    const mobileReviewA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(mobileReviewA11y.violations, `Mobile order-review accessibility: ${JSON.stringify(mobileReviewA11y.violations, null, 2)}`).toEqual([]);
    await page.screenshot({ path: qaPath('current', 'state-mobile-order-review.png'), animations: 'disabled' });

    await page.goto('/portfolio');
    await page.locator('.portfolio-page').waitFor();
    const positionsCard = page.locator('.positions-card');
    const scrollRegion = page.getByTestId('positions-scroll-region');
    await expect(positionsCard).toContainText(/swipe to inspect every column/i);
    const dimensions = await scrollRegion.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(dimensions.scrollWidth, 'Mobile position columns must remain horizontally explorable').toBeGreaterThan(dimensions.clientWidth);
    await positionsCard.screenshot({ path: qaPath('current', 'state-mobile-portfolio-swipe-cue.png'), animations: 'disabled' });
    await scrollRegion.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(() => scrollRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await positionsCard.screenshot({ path: qaPath('current', 'state-mobile-portfolio-scrolled.png'), animations: 'disabled' });
  });
});
