import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow, assertNoMojibake, assertRuntimeClean, auditRuntime, installLayoutShiftObserver, openRoute, qaPath, routes } from './helpers';

test.describe('visual route matrix', () => {
  test.beforeEach(async ({ page }) => installLayoutShiftObserver(page));
  const comparePixels = process.env.BETA_STOCK_PIXEL_COMPARE !== '0';

  for (const route of routes) {
    test(`${route.name} is credible, stable, and viewport-safe`, async ({ page }, testInfo) => {
      const audit = auditRuntime(page);
      try {
        await openRoute(page, route);
      } catch (caught) {
        const pageState = await page.evaluate(() => ({
          url: location.href,
          readyState: document.readyState,
          bodyText: document.body?.innerText.slice(0, 240) ?? '',
        })).catch(() => ({ url: page.url(), readyState: 'unavailable', bodyText: '' }));
        throw new Error(
          `${caught instanceof Error ? caught.message : String(caught)}; runtime=${JSON.stringify(audit)}; page=${JSON.stringify(pageState)}`,
          { cause: caught },
        );
      }
      await page.screenshot({
        path: qaPath('current', `${testInfo.project.name}-${route.name}.png`),
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
      });
      await assertNoHorizontalOverflow(page);
      await assertNoMojibake(page);
      await assertRuntimeClean(page, audit);
      if (comparePixels && testInfo.project.name !== 'desktop-1366') {
        await expect(page).toHaveScreenshot(`${testInfo.project.name}-${route.name}.png`, {
          animations: 'disabled',
          caret: 'hide',
          fullPage: true,
          maxDiffPixelRatio: 0.012,
        });
      }
    });
  }
});
