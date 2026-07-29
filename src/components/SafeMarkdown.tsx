import { Fragment, type HTMLAttributes, type ReactNode } from 'react';
import { parseSafeMarkdown, type SafeMarkdownInline } from './SafeMarkdownParser';

export interface SafeMarkdownProps extends HTMLAttributes<HTMLDivElement> {
  source: string;
}

function renderInline(nodes: SafeMarkdownInline[], path: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${path}-${index}`;
    if (node.type === 'text') return <Fragment key={key}>{node.value}</Fragment>;
    if (node.type === 'code') return <code key={key}>{node.value}</code>;
    if (node.type === 'citation') {
      return <a key={key} className="safe-citation" href={`#ai-evidence-${node.id.toLowerCase()}`} aria-label={`View submitted evidence ${node.id}`}>{node.id}</a>;
    }
    if (node.type === 'strong') return <strong key={key}>{renderInline(node.children, key)}</strong>;
    return <em key={key}>{renderInline(node.children, key)}</em>;
  });
}

function SafeHeading({ depth, children }: { depth: number; children: ReactNode }) {
  // Keep model output subordinate to the page title while retaining relative depth.
  if (depth >= 6) return <h6>{children}</h6>;
  if (depth === 5) return <h5>{children}</h5>;
  if (depth === 4) return <h4>{children}</h4>;
  if (depth === 3) return <h3>{children}</h3>;
  return <h2>{children}</h2>;
}

/**
 * Renders only the supported Markdown subset through React elements. There is no
 * HTML parsing or HTML injection path: unsupported markup remains visible text.
 */
export function SafeMarkdown({ source, className, ...props }: SafeMarkdownProps) {
  const blocks = parseSafeMarkdown(source);
  const classes = ['safe-markdown', className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...props}>
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        if (block.type === 'heading') {
          return <SafeHeading key={key} depth={block.depth}>{renderInline(block.children, key)}</SafeHeading>;
        }
        if (block.type === 'unordered-list') {
          return <ul key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>)}</ul>;
        }
        return <p key={key}>{renderInline(block.children, key)}</p>;
      })}
    </div>
  );
}
