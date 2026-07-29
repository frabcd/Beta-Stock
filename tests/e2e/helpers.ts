import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export const QA_ROOT = path.resolve(process.env.BETA_STOCK_ROOT ?? process.cwd(), 'artifacts', 'qa');

export const routes = [
  { name: 'overview', path: '/', marker: '.overview-page', heading: /overview|welcome to beta-stock|good (morning|afternoon|evening)/i },
  { name: 'markets', path: '/markets', marker: '.markets-page', heading: /markets/i },
  { name: 'trade', path: '/trade/NVDA', marker: '.trade-page', heading: /NVDA/i },
  { name: 'portfolio', path: '/portfolio', marker: '.portfolio-page', heading: /portfolio/i },
  { name: 'orders', path: '/orders', marker: '.orders-page', heading: /orders/i },
  { name: 'ai-lab', path: '/ai-lab', marker: '.ai-page', heading: /AI Lab/i },
] as const;

export function qaPath(...segments: string[]) {
  const destination = path.join(QA_ROOT, ...segments);
  mkdirSync(path.dirname(destination), { recursive: true });
  return destination;
}

export type RuntimeAudit = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  httpErrors: string[];
  serverErrors: string[];
};

export async function installLayoutShiftObserver(page: Page) {
  await page.addInitScript(() => {
    const scope = window as typeof window & {
      __betaLayoutShifts?: number[];
      __betaLayoutShiftSources?: Array<{ node: string; previous: string; current: string }>;
    };
    scope.__betaLayoutShifts = [];
    scope.__betaLayoutShiftSources = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & {
        value?: number;
        hadRecentInput?: boolean;
        sources?: Array<{ node?: Node; previousRect?: DOMRectReadOnly; currentRect?: DOMRectReadOnly }>;
      }>) {
        if (!entry.hadRecentInput && typeof entry.value === 'number') {
          scope.__betaLayoutShifts?.push(entry.value);
          for (const source of entry.sources ?? []) {
            const element = source.node instanceof Element ? source.node : source.node?.parentElement;
            const describeRect = (rect?: DOMRectReadOnly) => rect
              ? `${rect.x.toFixed(1)},${rect.y.toFixed(1)} ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`
              : 'unavailable';
            scope.__betaLayoutShiftSources?.push({
              node: element
                ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.classList.length ? `.${[...element.classList].slice(0, 3).join('.')}` : ''}`
                : source.node?.nodeName ?? 'unknown',
              previous: describeRect(source.previousRect),
              current: describeRect(source.currentRect),
            });
          }
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

export function auditRuntime(page: Page): RuntimeAudit {
  const audit: RuntimeAudit = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [], serverErrors: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') audit.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => audit.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.hostname === '127.0.0.1') audit.failedRequests.push(`${request.method()} ${url.pathname}: ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname === '127.0.0.1' && response.status() >= 400) {
      const detail = `${response.status()} ${response.request().method()} ${url.pathname}`;
      audit.httpErrors.push(detail);
      if (response.status() >= 500) audit.serverErrors.push(detail);
    }
  });
  return audit;
}

export async function openRoute(page: Page, route: (typeof routes)[number]) {
  await page.goto(route.path, { waitUntil: 'domcontentloaded' });
  await page.locator(route.marker).waitFor({ state: 'visible' });
  await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
  const provenance = page.getByTestId('data-provenance');
  if (await provenance.isVisible()) {
    await expect(provenance).not.toContainText(/connecting|checking service/i, { timeout: 15_000 });
  } else {
    // Compact mobile layouts can replace the full provenance component with visible
    // classification/source chips; release-gates separately require age and source text.
    await expect(page.locator(route.marker)).toContainText(/synthetic|simulated/i);
  }
  await expect(page.locator(route.marker).locator('.skeleton-row')).toHaveCount(0, { timeout: 15_000 });
  // Two animation frames let chart/layout observers settle without relying on the
  // network-idle heuristic, which is invalid for an app with periodic health polling.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const width = window.innerWidth;
    const visibleOverflow = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        if (rect.width < 1 || rect.height < 1) return false;
        if (element.closest('[hidden], [aria-hidden="true"]')) return false;
        if (rect.left >= -1 && rect.right <= width + 1) return false;
        let ancestor = element.parentElement;
        while (ancestor && ancestor !== document.body) {
          const ancestorStyle = getComputedStyle(ancestor);
          if (['hidden', 'clip', 'auto', 'scroll'].includes(ancestorStyle.overflowX)) return false;
          ancestor = ancestor.parentElement;
        }
        return true;
      })
      .slice(0, 12)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.classList.length ? `.${[...element.classList].slice(0, 2).join('.')}` : ''} [${rect.left.toFixed(1)}, ${rect.right.toFixed(1)}]`;
      });
    return {
      viewport: width,
      html: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      visibleOverflow,
    };
  });
  expect(overflow, `horizontal clipping/overflow: ${JSON.stringify(overflow)}`).toMatchObject({
    html: expect.any(Number),
    body: expect.any(Number),
    visibleOverflow: [],
  });
  expect(overflow.html, 'documentElement is wider than the viewport').toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.body, 'body is wider than the viewport').toBeLessThanOrEqual(overflow.viewport + 1);
}

export async function assertNoMojibake(page: Page) {
  const body = await page.locator('body').innerText();
  // Code-point escapes keep this detector stable even when a Windows shell is using a legacy code page.
  const suspicious = body.match(/[\u9225\u922b\u9231\u922d\u8320\u8133\u697c\u9286\u951f\ufffd]/g) ?? [];
  expect(suspicious, `visible text contains likely encoding corruption: ${[...new Set(suspicious)].join(', ')}`).toEqual([]);
}

export async function assertRuntimeClean(page: Page, audit: RuntimeAudit) {
  await expect.poll(() => audit, { timeout: 1_000 }).toEqual({
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    serverErrors: [],
  });
  const cls = await page.evaluate(() => {
    const scope = window as typeof window & {
      __betaLayoutShifts?: number[];
      __betaLayoutShiftSources?: Array<{ node: string; previous: string; current: string }>;
    };
    const values = scope.__betaLayoutShifts ?? [];
    return {
      value: values.reduce((sum, value) => sum + value, 0),
      sources: scope.__betaLayoutShiftSources ?? [],
    };
  });
  expect(cls.value, `unexpected cumulative layout shift after the route became interactive; sources=${JSON.stringify(cls.sources)}`).toBeLessThanOrEqual(0.01);
}
