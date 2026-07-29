import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SafeMarkdown } from '../../src/components/SafeMarkdown';
import { parseSafeMarkdown } from '../../src/components/SafeMarkdownParser';

describe('safe AI Markdown', () => {
  it('structures the deterministic finance brief subset', () => {
    const blocks = parseSafeMarkdown([
      '### US growth simulator brief',
      '',
      '**Read:** Selective momentum with `synthetic` inputs.',
      '',
      '**Scenario map**',
      '- Bull case: improving breadth.',
      '- Bear case: prior close fails.',
      '',
      '_Research only._',
    ].join('\n'));

    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
      'unordered-list',
      'paragraph',
    ]);
    expect(blocks[0]).toMatchObject({ type: 'heading', depth: 3 });
    expect(blocks[3]).toMatchObject({ type: 'unordered-list', items: expect.any(Array) });
    if (blocks[3].type === 'unordered-list') expect(blocks[3].items).toHaveLength(2);

    const html = renderToStaticMarkup(createElement(SafeMarkdown, { source: '### Brief\n\n**Read:** Use `synthetic` data.\n\n- First\n- Second\n\n_Research only._' }));
    expect(html).toContain('<h3>Brief</h3>');
    expect(html).toContain('<strong>Read:</strong>');
    expect(html).toContain('<code>synthetic</code>');
    expect(html).toContain('<ul><li>First</li><li>Second</li></ul>');
    expect(html).toContain('<em>Research only.</em>');
  });

  it('turns only allowlisted evidence tokens into fixed same-page anchors', () => {
    const source = 'Synthetic context [S1], portfolio context [S2]. Keep [S0], [S9], [S10], and [S2](https://example.test) local.';
    const html = renderToStaticMarkup(createElement(SafeMarkdown, { source }));

    expect(html).toContain('href="#ai-evidence-s1"');
    expect(html).toContain('href="#ai-evidence-s2"');
    expect(html).toContain('aria-label="View submitted evidence S1"');
    expect(html).toContain('[S0]');
    expect(html).toContain('[S9]');
    expect(html).toContain('[S10]');
    expect(html).toContain('(https://example.test)');
    expect(html).not.toContain('href="https://example.test"');
    expect(html).not.toMatch(/href="(?:javascript|data):/i);
  });

  it('never promotes HTML, links, or incomplete markup into executable DOM', () => {
    const hostile = [
      '<script>alert("xss")</script>',
      '',
      '**<img src=x onerror=alert(1)>**',
      '',
      '[trade now](javascript:alert(1)) and ~~unsupported~~',
      '',
      '`<svg onload=alert(1)>` and **unclosed',
    ].join('\n');
    const hostileProps = { source: hostile, 'data-testid': 'ai-response' };
    const html = renderToStaticMarkup(createElement(SafeMarkdown, hostileProps));

    expect(html).not.toMatch(/<(script|img|svg)\b/i);
    expect(html).not.toContain('<a');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('[trade now](javascript:alert(1))');
    expect(html).toContain('~~unsupported~~');
    expect(html).toContain('**unclosed');
    expect(html).toContain('data-testid="ai-response"');
  });
});
