export type SafeCitationId = 'S1' | 'S2';

export type SafeMarkdownInline =
  | { type: 'text'; value: string }
  | { type: 'strong' | 'emphasis'; children: SafeMarkdownInline[] }
  | { type: 'code'; value: string }
  | { type: 'citation'; id: SafeCitationId };

export type SafeMarkdownBlock =
  | { type: 'heading'; depth: number; children: SafeMarkdownInline[] }
  | { type: 'paragraph'; children: SafeMarkdownInline[] }
  | { type: 'unordered-list'; items: SafeMarkdownInline[][] };

function appendText(nodes: SafeMarkdownInline[], value: string) {
  if (!value) return;
  const previous = nodes.at(-1);
  if (previous?.type === 'text') previous.value += value;
  else nodes.push({ type: 'text', value });
}

function findClosingDelimiter(source: string, delimiter: string, from: number) {
  const closing = source.indexOf(delimiter, from);
  return closing > from ? closing : -1;
}

/**
 * Tokenizes a deliberately small, non-HTML inline subset. Unknown or incomplete
 * syntax is retained as text and is therefore escaped by React at render time.
 */
export function parseSafeMarkdownInline(source: string): SafeMarkdownInline[] {
  const nodes: SafeMarkdownInline[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const citation = /^\[S([12])\]/.exec(source.slice(cursor));
    if (citation) {
      nodes.push({ type: 'citation', id: `S${citation[1]}` as SafeCitationId });
      cursor += citation[0].length;
      continue;
    }

    if (source[cursor] === '`') {
      const closing = findClosingDelimiter(source, '`', cursor + 1);
      if (closing !== -1) {
        nodes.push({ type: 'code', value: source.slice(cursor + 1, closing) });
        cursor = closing + 1;
        continue;
      }
    }

    if (source.startsWith('**', cursor)) {
      const closing = findClosingDelimiter(source, '**', cursor + 2);
      if (closing !== -1) {
        nodes.push({ type: 'strong', children: parseSafeMarkdownInline(source.slice(cursor + 2, closing)) });
        cursor = closing + 2;
        continue;
      }
    }

    const delimiter = source[cursor];
    if ((delimiter === '*' || delimiter === '_') && !source.startsWith(`${delimiter}${delimiter}`, cursor)) {
      const closing = findClosingDelimiter(source, delimiter, cursor + 1);
      if (closing !== -1) {
        nodes.push({ type: 'emphasis', children: parseSafeMarkdownInline(source.slice(cursor + 1, closing)) });
        cursor = closing + 1;
        continue;
      }
    }

    appendText(nodes, source[cursor]);
    cursor += 1;
  }

  return nodes;
}

/** Parses headings, paragraphs, and flat unordered lists without accepting HTML. */
export function parseSafeMarkdown(source: string): SafeMarkdownBlock[] {
  const blocks: SafeMarkdownBlock[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let listItems: SafeMarkdownInline[][] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', children: parseSafeMarkdownInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({ type: 'unordered-list', items: listItems });
    listItems = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^ {0,3}(#{1,6})[\t ]+(.+?)\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: 'heading',
        depth: heading[1].length,
        children: parseSafeMarkdownInline(heading[2]),
      });
      continue;
    }

    const listItem = /^ {0,3}[-+*][\t ]+(.+?)\s*$/.exec(line);
    if (listItem) {
      flushParagraph();
      listItems.push(parseSafeMarkdownInline(listItem[1]));
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}
