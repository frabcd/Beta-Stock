import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { BookMarked, CalendarDays, CheckCircle2, ChevronRight, CircleDot, Download, FilePenLine, Filter, MessageSquareText, Search, SlidersHorizontal, Target, XCircle } from 'lucide-react';
import { useNavigate } from '../../app/router';
import { ApiError, useCancelOrder, useOrders, type ApiOrder } from '../../app/api';
import { equities } from '../../app/data';
import { Button, Card, CardHeader, Change, EmptyState, ErrorState, LoadingState, MarketTag, PageHeader, Provenance, StatusPill, SymbolAvatar, TabsRow, cn } from '../../components/UI';

type OrdersTab = 'All' | 'Working' | 'Filled' | 'Journal';

const journal = [
  { id: 1, date: '27 Jul', symbol: 'NVDA', title: 'Added into strength after clean retest', thesis: 'Sample journal entry: AI infrastructure breadth expanded while NVDA held the prior breakout. Sized below plan due to event proximity.', tags: ['Momentum', 'Plan followed'], score: 'A-', pnl: 101.4 },
  { id: 2, date: '25 Jul', symbol: '9988', title: 'Averaged before confirmation', thesis: 'Sample journal entry: the sector thesis remained intact, but entry was early relative to the 20-day trend.', tags: ['Mean reversion', 'Process miss'], score: 'C+', pnl: -2480 },
  { id: 3, date: '23 Jul', symbol: '300750', title: 'Breakout from six-week base', thesis: 'Sample journal entry: institutional flow and improving battery-chain revisions aligned with a defined invalidation.', tags: ['Breakout', 'Plan followed'], score: 'A', pnl: 6732 },
];

const isWorking = (order: ApiOrder) => ['PENDING_VALIDATION', 'ACCEPTED', 'TRIGGERED', 'PARTIALLY_FILLED'].includes(order.status);
const lifecycleStates = [
  { label: 'Pending', detail: 'Validating rules' },
  { label: 'Accepted', detail: 'Working at venue' },
  { label: 'Partial', detail: 'Some shares filled' },
  { label: 'Filled', detail: 'Execution complete' },
  { label: 'Cancelled', detail: 'Stopped by user' },
  { label: 'Rejected', detail: 'Rule check failed' },
] as const;

export function OrdersJournal() {
  const [tab, setTab] = useState<OrdersTab>('All');
  const [query, setQuery] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ApiOrder | null>(null);
  const orders = useOrders();
  const cancelOrder = useCancelOrder();
  const navigate = useNavigate();
  const allOrders = orders.data ?? [];
  const filledCount = allOrders.filter((order) => order.status === 'FILLED').length;
  const workingCount = allOrders.filter(isWorking).length;
  const rejectedCount = allOrders.filter((order) => order.status === 'REJECTED').length;
  const cancelledCount = allOrders.filter((order) => order.status === 'CANCELLED').length;
  const filtered = allOrders.filter((order) => {
    const tabMatch = tab === 'All' || tab === 'Journal' || (tab === 'Working' ? isWorking(order) : order.status === 'FILLED');
    return tabMatch && `${order.symbol} ${order.displayType} ${order.displaySide}`.toLowerCase().includes(query.toLowerCase());
  });

  const cancel = async (orderId: string) => {
    setCancelError(null);
    try { await cancelOrder.mutateAsync(orderId); setCancelTarget(null); }
    catch (error) { setCancelError(error instanceof ApiError ? error.message : 'The order could not be cancelled.'); }
  };

  return (
    <div className="page orders-page" data-testid="orders-page">
      <PageHeader eyebrow="EXECUTION & REVIEW" title="Orders and journal" description="Track persisted simulator orders, then review sample decision notes." actions={<><Button variant="ghost" disabled title="Export is not available yet"><Download size={14} /> Export unavailable</Button><Button variant="primary" onClick={() => setTab('Journal')}><FilePenLine size={15} /> Open journal</Button></>} />
      <Provenance />
      <div className="orders-tabs-bar" data-testid="orders-tabs"><TabsRow value={tab} onChange={setTab} label="Order view" items={[{ value: 'All', label: 'All orders', count: allOrders.length }, { value: 'Working', label: 'Working', count: workingCount }, { value: 'Filled', label: 'Filled', count: filledCount }, { value: 'Journal', label: 'Sample journal', count: journal.length }]} /><div className="table-tools"><label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity" /></label><button disabled title="Advanced filters are not available yet"><Filter size={15} /></button></div></div>

      {tab !== 'Journal' ? <>
        <div className="order-summary-grid">
          <Card><span className="summary-icon good"><CheckCircle2 size={17} /></span><div><span>Filled</span><strong>{filledCount}</strong><small>persisted outcomes</small></div></Card>
          <Card><span className="summary-icon blue"><Target size={17} /></span><div><span>Working</span><strong>{workingCount}</strong><small>cancellable states</small></div></Card>
          <Card><span className="summary-icon neutral"><CircleDot size={17} /></span><div><span>Total submitted</span><strong>{allOrders.length}</strong><small>local simulator</small></div></Card>
          <Card><span className="summary-icon warn"><XCircle size={17} /></span><div><span>Rejected / cancelled</span><strong>{rejectedCount} / {cancelledCount}</strong><small>engine outcomes</small></div></Card>
        </div>
        <div className="lifecycle-legend" role="list" aria-label="Order lifecycle states">
          {lifecycleStates.map((state, index) => <div className="lifecycle-state" role="listitem" key={state.label}><span>{index + 1}</span><div><strong>{state.label}</strong><small>{state.detail}</small></div></div>)}
        </div>
        <Card className="orders-table-card">
          <CardHeader title="Order blotter" eyebrow="PERSISTED - ALL VENUES" action={<Button variant="ghost" disabled title="Column settings are not available yet"><SlidersHorizontal size={14} /> Fixed columns</Button>} />
          {orders.isLoading ? <LoadingState /> : orders.isError ? <ErrorState onRetry={() => void orders.refetch()} /> : filtered.length ? <div className="data-table orders-table"><div className="table-head"><span>Time / ID</span><span>Instrument</span><span>Side</span><span>Type</span><span>Quantity</span><span>Price</span><span>Status</span><span /></div>{filtered.map((order) => {
            const equity = equities.find((item) => item.symbol === order.symbol);
            const cancellable = isWorking(order);
            return <div className="table-row" key={order.id}><span className="order-id"><strong>{order.time}</strong><small>{order.id}</small></span><button type="button" className="instrument-cell order-instrument-link" aria-label={`Open ${order.symbol} trade workspace`} onClick={() => navigate(`/trade/${order.symbol}`)}><SymbolAvatar symbol={order.symbol} color={equity?.color} /><span><strong>{order.symbol}</strong><small>{equity?.name ?? order.displaySymbol ?? order.instrumentId}</small></span><MarketTag region={order.market} /></button><span className={cn('side-label', order.side === 'BUY' ? 'buy' : 'sell')}>{order.displaySide}</span><span>{order.displayType}</span><span className="number-cell"><strong>{order.filledQuantity} / {order.quantity}</strong><small>filled</small></span><span>{order.price ? order.price.toFixed(2) : '-'}</span><StatusPill tone={order.status === 'FILLED' ? 'good' : cancellable ? 'blue' : order.status === 'REJECTED' ? 'warn' : 'neutral'}><span className={cn('session-dot', cancellable && 'open')} /> {order.displayStatus}</StatusPill>{cancellable ? <button className="cancel-order" data-testid={`cancel-order-${order.id}`} disabled={cancelOrder.isPending} onClick={() => setCancelTarget(order)}>Cancel</button> : <button type="button" className="order-open" aria-label={`Open ${order.symbol} trade workspace`} onClick={() => navigate(`/trade/${order.symbol}`)}><ChevronRight size={14} /></button>}</div>;
          })}</div> : allOrders.length === 0 ? <section className="orders-empty-onboarding" aria-labelledby="orders-empty-title" data-testid="orders-empty-onboarding">
            <div className="orders-empty-intro"><span><BookMarked size={20} /></span><div><p className="eyebrow">FRESH PAPER ACCOUNT</p><h3 id="orders-empty-title">Your order blotter is ready</h3><p>No orders have been submitted to this deterministic local account. Start a paper trade to create a persisted lifecycle record here.</p></div><Button variant="primary" onClick={() => navigate('/trade/NVDA')}>Open trade workspace</Button></div>
            <ol className="orders-empty-steps">
              <li><span>01</span><div><strong>Choose a market</strong><small>Open a US, Hong Kong, or Mainland China instrument.</small></div></li>
              <li><span>02</span><div><strong>Review the rule checks</strong><small>Confirm lot size, tick, session, currency, and estimated fees.</small></div></li>
              <li><span>03</span><div><strong>Follow the lifecycle</strong><small>Inspect accepted, working, filled, cancelled, or rejected outcomes.</small></div></li>
            </ol>
          </section> : <EmptyState title="No matching orders" message="Change the active filter or submit a simulated order." />}
          {cancelError && <div className="orders-error" role="alert">{cancelError}</div>}
          <footer className="table-footer"><span>Times returned by the local simulation engine</span><span>Synthetic paper execution only</span></footer>
        </Card>
        <div className="execution-grid"><Card><CardHeader title="Outcome distribution" eyebrow="SERVER STATE" action={<BookMarked size={16} />} /><div className="venue-list"><div><span>Filled</span><strong>{filledCount}</strong><i><em style={{ width: `${allOrders.length ? (filledCount / allOrders.length) * 100 : 0}%` }} /></i></div><div><span>Working</span><strong>{workingCount}</strong><i><em style={{ width: `${allOrders.length ? (workingCount / allOrders.length) * 100 : 0}%` }} /></i></div><div><span>Rejected or cancelled</span><strong>{rejectedCount + cancelledCount}</strong><i><em style={{ width: `${allOrders.length ? ((rejectedCount + cancelledCount) / allOrders.length) * 100 : 0}%` }} /></i></div></div></Card><Card className="process-card"><CardHeader title="Execution trust boundary" eyebrow="SYNTHETIC PAPER ONLY" action={<Target size={16} />} /><p>Every row above is returned by the local simulation engine and persisted in SQLite. No exchange, broker, funds, or external securities account is involved.</p><Button variant="secondary" onClick={() => navigate('/trade/NVDA')}>Open trade workspace</Button></Card></div>
        <Dialog.Root open={Boolean(cancelTarget)} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="reset-dialog" aria-describedby="cancel-order-description">
              <Dialog.Title>Cancel this paper order?</Dialog.Title>
              <Dialog.Description id="cancel-order-description">{cancelTarget ? `${cancelTarget.displaySide} ${cancelTarget.quantity} ${cancelTarget.symbol} (${cancelTarget.displayType}) will stop working in the local simulator.` : 'The selected simulated order will be cancelled.'}</Dialog.Description>
              {cancelError && <div className="orders-error" role="alert">{cancelError}</div>}
              <div className="reset-actions"><Dialog.Close asChild><Button variant="ghost">Keep order working</Button></Dialog.Close><Button variant="primary" onClick={() => cancelTarget && void cancel(cancelTarget.id)} disabled={cancelOrder.isPending}>{cancelOrder.isPending ? 'Cancelling...' : 'Confirm cancel'}</Button></div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </> : <div className="journal-layout">
        <div className="journal-feed">{journal.filter((entry) => `${entry.symbol} ${entry.title}`.toLowerCase().includes(query.toLowerCase())).map((entry) => { const equity = equities.find((item) => item.symbol === entry.symbol)!; return <Card className="journal-entry" key={entry.id}><div className="journal-date"><CalendarDays size={15} /><span>{entry.date}</span></div><div className="journal-main"><div className="journal-title"><SymbolAvatar symbol={entry.symbol} color={equity.color} /><div><span><strong>{entry.symbol}</strong><MarketTag region={equity.region} /></span><h2>{entry.title}</h2></div><span className="journal-grade">{entry.score}</span></div><p>{entry.thesis}</p><div className="journal-tags">{entry.tags.map((tag) => <StatusPill key={tag} tone={tag.includes('miss') ? 'warn' : 'neutral'}>{tag}</StatusPill>)}<Change value={entry.pnl} suffix=" P&L" /></div></div><button className="journal-comment" disabled title="Journal comments are not editable yet" aria-label="Journal comments unavailable"><MessageSquareText size={16} /></button></Card>; })}</div>
        <aside><Card className="journal-stats"><CardHeader title="Sample process score" eyebrow="ILLUSTRATIVE JOURNAL" action={<BookMarked size={16} />} /><div className="score-ring"><div><strong>82</strong><span>/ 100</span></div></div><div className="score-breakdown"><div><span>Plan adherence</span><strong>88</strong></div><div><span>Risk discipline</span><strong>91</strong></div><div><span>Entry timing</span><strong>72</strong></div><div><span>Review quality</span><strong>78</strong></div></div></Card><Card className="journal-pattern"><span className="eyebrow">SAMPLE PATTERN</span><h3>Strong thesis, early trigger</h3><p>This static example shows how a future journal could identify recurring process errors.</p><Button variant="secondary" disabled title="Editable journal checklists are not available yet">Checklist unavailable</Button></Card></aside>
      </div>}
    </div>
  );
}
