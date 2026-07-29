import { test, expect } from '@playwright/test';
import { openRoute, qaPath, routes } from './helpers';

test('documentation mobile trade viewport capture', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390', '390x844 documentation capture only');
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, routes[2]);
  await expect(page.getByRole('dialog', { name: /trade NVDA/i })).toHaveCount(0);
  await page.screenshot({
    path: qaPath('current', 'docs-mobile-trade-390x844.png'),
    fullPage: false,
    animations: 'disabled',
  });
});
