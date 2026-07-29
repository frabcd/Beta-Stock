import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { openRoute, routes } from './helpers';

test.describe('WCAG AA and keyboard behavior', () => {
  for (const route of routes) {
    test(`${route.name} has no axe WCAG A/AA violations`, async ({ page }) => {
      await openRoute(page, route);
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
    });
  }

  test('primary shell and command palette remain operable by keyboard', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'single desktop keyboard audit');
    await page.goto('/');
    await page.locator('.overview-page').waitFor();
    const visited: string[] = [];
    for (let index = 0; index < 24; index += 1) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 60) || element.tagName,
          visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0,
          indicator: style.outlineStyle !== 'none' || style.boxShadow !== 'none' || element.matches(':focus-visible'),
        };
      });
      expect(state?.visible, `focus escaped onto an invisible control: ${JSON.stringify(state)}`).toBe(true);
      expect(state?.indicator, `no visible focus treatment: ${JSON.stringify(state)}`).toBe(true);
      if (state?.label) visited.push(state.label);
    }
    expect(new Set(visited).size, `tab sequence repeated or trapped too early: ${visited.join(' -> ')}`).toBeGreaterThan(10);

    await page.keyboard.press('Control+K');
    const dialog = page.getByRole('dialog', { name: /search beta-stock/i });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('reduced-motion preference suppresses nonessential animation', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'single reduced-motion audit');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await openRoute(page, routes[0]);
    const offenders = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const style = getComputedStyle(element);
        return { element: `${element.tagName}.${[...element.classList].join('.')}`, animation: style.animationDuration, transition: style.transitionDuration };
      })
      .filter(({ animation, transition }) => Math.max(...`${animation},${transition}`.split(',').map((value) => Number.parseFloat(value) || 0)) > 0.05)
      .slice(0, 20));
    expect(offenders, `motion remains active under prefers-reduced-motion: ${JSON.stringify(offenders)}`).toEqual([]);
    await context.close();
  });
});
