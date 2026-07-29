import type { ButtonHTMLAttributes, HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import clsx from 'clsx';
import { AlertCircle, ArrowDownRight, ArrowUpRight, Database, Inbox, RefreshCw, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../app/store';
import { fixtureMode, useBootstrap, useHealth } from '../app/api';

// Shared with the component primitives so call sites keep one visual-system import.
// eslint-disable-next-line react-refresh/only-export-components
export const cn = (...values: Parameters<typeof clsx>) => clsx(...values);

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('card', className)} {...props}>{children}</section>;
}

export function CardHeader({ title, eyebrow, action, className }: { title: ReactNode; eyebrow?: string; action?: ReactNode; className?: string }) {
  return (
    <header className={cn('card-header', className)}>
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2 className="card-title">{title}</h2>
      </div>
      {action && <div className="card-action">{action}</div>}
    </header>
  );
}

export function Button({ className, variant = 'secondary', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={cn('button', `button-${variant}`, className)} {...props}>{children}</button>;
}

export function IconButton({ label, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={cn('icon-button', className)} aria-label={label} title={label} {...props}>{children}</button>;
}

export function Change({ value, suffix = '%', showIcon = false, className }: { value: number; suffix?: string; showIcon?: boolean; className?: string }) {
  const convention = useAppStore((state) => state.gainConvention);
  const up = value >= 0;
  return (
    <span className={cn('change', up ? 'is-gain' : 'is-loss', convention === 'red-up' && 'reverse-gain-colors', className)}>
      {showIcon && (up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />)}
      {up ? '+' : ''}{value.toFixed(2)}{suffix}
    </span>
  );
}

export function MarketTag({ region }: { region: 'US' | 'HK' | 'CN' }) {
  return <span className={cn('market-tag', `market-${region.toLowerCase()}`)}>{region}</span>;
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'blue' }) {
  return <span className={cn('status-pill', `status-${tone}`)}>{children}</span>;
}

export function SymbolAvatar({ symbol, color = '#7f9cff', size = 'md' }: { symbol: string; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const label = symbol.replace(/[^a-zA-Z]/g, '').slice(0, 2) || symbol.slice(0, 2);
  return <span className={cn('symbol-avatar', `avatar-${size}`)} style={{ '--avatar-color': color } as React.CSSProperties}>{label.toUpperCase()}</span>;
}

export function Sparkline({ data, positive = true, width = 112, height = 36, id }: { data: number[]; positive?: boolean; width?: number; height?: number; id?: string }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const points = data.map((value, index) => `${pad + (index / (data.length - 1)) * (width - pad * 2)},${pad + (1 - (value - min) / range) * (height - pad * 2)}`).join(' ');
  const gradientId = `spark-${id ?? Math.abs(data[0]).toString().replace('.', '-')}`;
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={positive ? 'Rising price trend' : 'Falling price trend'}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={positive ? 'var(--gain)' : 'var(--loss)'} stopOpacity=".24" />
          <stop offset="1" stopColor={positive ? 'var(--gain)' : 'var(--loss)'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${points} ${width - pad},${height} ${pad},${height}`} fill={`url(#${gradientId})`} />
      <polyline points={points} fill="none" stroke={positive ? 'var(--gain)' : 'var(--loss)'} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <motion.header className="page-header" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28 }}>
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </motion.header>
  );
}

export function Metric({ label, value, change, note, accent }: { label: string; value: string; change?: number; note?: string; accent?: boolean }) {
  return (
    <Card className={cn('metric-card', accent && 'metric-accent')}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-meta">
        {change !== undefined && <Change value={change} showIcon />}
        {note && <span>{note}</span>}
      </div>
    </Card>
  );
}

export function Provenance({ compact = false }: { compact?: boolean }) {
  const bootstrap = useBootstrap();
  const health = useHealth();
  const provenance = bootstrap.data?.provenance;
  const asOf = provenance ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(provenance.asOf)) : null;
  const label = fixtureMode
    ? `Explicit fixture mode / ${provenance?.source ?? 'static browser snapshot'}`
    : bootstrap.isPending
      ? 'Connecting to local market data service...'
      : bootstrap.isError
        ? 'Market data service unavailable'
        : `${provenance?.classification ?? 'Unknown'} / ${provenance?.source ?? 'source unavailable'}${asOf ? ` / as of ${asOf} UTC` : ''}`;
  return (
    <div className={cn('provenance', compact && 'provenance-compact', bootstrap.isError && 'provenance-error')} data-testid="data-provenance">
      <span className={cn('live-dot', !bootstrap.isSuccess && 'pending')} />
      <Database size={13} />
      <span>{label}</span>
      {!compact && <span className="provenance-secure"><ShieldCheck size={13} /> {health.isSuccess ? `${health.data.service} connected` : health.isError ? 'service offline' : 'checking service'}</span>}
    </div>
  );
}

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return <div className="loading-state" aria-label="Loading data">{Array.from({ length: rows }, (_, index) => <div className="skeleton-row" key={index}><span /><span /><span /></div>)}</div>;
}

export function ErrorState({ message = 'Market data is temporarily unavailable.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="state-panel" role="alert">
      <span className="state-icon"><AlertCircle size={20} /></span>
      <strong>Unable to refresh</strong>
      <p>{message}</p>
      {onRetry && <Button onClick={onRetry}><RefreshCw size={14} /> Try again</Button>}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', message = 'Your activity will appear here when it is available.' }: { title?: string; message?: string }) {
  return <div className="state-panel"><span className="state-icon"><Inbox size={20} /></span><strong>{title}</strong><p>{message}</p></div>;
}

export function TabsRow<T extends string>({ value, onChange, items, label }: { value: T; onChange: (value: T) => void; items: { value: T; label: string; count?: number }[]; label: string }) {
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const destination = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : direction ? (index + direction + items.length) % items.length : -1;
    if (destination < 0) return;
    event.preventDefault();
    onChange(items[destination].value);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[destination]?.focus();
  };
  return (
    <div className="tabs-row" role="tablist" aria-label={label}>
      {items.map((item, index) => <button key={item.value} role="tab" aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1} className={cn(value === item.value && 'active')} onClick={() => onChange(item.value)} onKeyDown={(event) => moveFocus(event, index)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}
    </div>
  );
}

export function Divider() {
  return <div className="divider" />;
}
