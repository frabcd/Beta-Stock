import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Bot, CalendarClock, ChevronRight, CircleDollarSign, Globe2, Newspaper, RefreshCcw, RotateCcw, ShieldCheck, Sparkles, Target, TriangleAlert, X } from 'lucide-react';
import { useNavigate } from '../../app/router';
import { headlines, portfolioCurve } from '../../app/data';
import { ApiError, useEquities, usePortfolio, useResetSimulator } from '../../app/api';
import { Button, Card, CardHeader, Change, ErrorState, LoadingState, MarketTag, Metric, PageHeader, Provenance, Sparkline, StatusPill, SymbolAvatar } from '../../components/UI';
import { FinancialChart } from '../../components/FinancialChart';

export function Overview() {
  const portfolio = usePortfolio();
  const equityQuery = useEquities();
  const resetSimulator = useResetSimulator();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const navigate = useNavigate();
  const watchlist = (equityQuery.data ?? []).slice(0, 6);
  const unrealized = portfolio.data?.positions.reduce((sum, position) => sum + (position.pnlBase ?? 0), 0) ?? 0;
  const dayPnl = portfolio.data?.positions.reduce((sum, position) => sum + (position.dayBase ?? 0), 0) ?? 0;
  const equity = portfolio.data?.equity ?? 0;
  const buyingPower = portfolio.data?.buyingPower ?? 0;
  const curveAnchor = portfolioCurve.at(-1)?.value ?? 1;
  const curveValues = portfolioCurve.map((point) => equity ? Number((point.value / curveAnchor * equity).toFixed(2)) : point.value);
  const confirmReset = async () => {
    setResetError(null);
    try {
      const result = await resetSimulator.mutateAsync();
      setResetFeedback(result.message);
      setResetOpen(false);
    } catch (error) {
      setResetError(error instanceof ApiError ? error.message : 'The paper account could not be reset.');
    }
  };
  return (
    <div className="page overview-page" data-testid="overview-page">
      <PageHeader eyebrow="DEMO ACCOUNT - CROSS-MARKET SIMULATOR" title="Welcome to Beta-Stock." description="A server-backed paper portfolio across US, Hong Kong, and Mainland China markets." actions={<><Button variant="ghost" className="mobile-reset-control" aria-label="Reset paper simulator" onClick={() => setResetOpen(true)} disabled={resetSimulator.isPending}><RotateCcw size={14} /> Reset simulator</Button><Button variant="ghost" onClick={() => { void portfolio.refetch(); void equityQuery.refetch(); }}><RefreshCcw size={14} /> Refresh API data</Button><Button variant="primary" onClick={() => navigate('/trade/NVDA')}>Place a paper trade <ArrowRight size={15} /></Button></>} />

      <Provenance />
      {resetFeedback && <div className="reset-feedback" role="status"><ShieldCheck size={15} /> {resetFeedback}</div>}

      <Dialog.Root open={resetOpen} onOpenChange={(open) => { setResetOpen(open); if (open) setResetError(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="reset-dialog" aria-describedby="reset-simulator-description">
            <div className="reset-warning" aria-hidden="true"><TriangleAlert size={21} /></div>
            <Dialog.Title>Reset the paper simulator?</Dialog.Title>
            <Dialog.Description id="reset-simulator-description">This clears every simulated order and portfolio change, then restores the deterministic demo account. This cannot be undone. No broker or external account is affected.</Dialog.Description>
            {resetError && <div className="orders-error" role="alert">{resetError}</div>}
            <div className="reset-actions">
              <Dialog.Close asChild><Button variant="ghost">Keep current account</Button></Dialog.Close>
              <Button variant="primary" onClick={() => void confirmReset()} disabled={resetSimulator.isPending}>{resetSimulator.isPending ? 'Resetting...' : 'Confirm reset'}</Button>
            </div>
            <Dialog.Close className="command-close" aria-label="Close reset dialog"><X size={18} /></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {portfolio.isLoading ? <LoadingState rows={3} /> : portfolio.isError ? <ErrorState onRetry={() => void portfolio.refetch()} /> : <>
        <div className="metric-grid">
          <Metric label="Net liquidation value" value={`$${equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} note="server portfolio snapshot" accent />
          <Metric label="Available buying power" value={`$${buyingPower.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} note={equity ? `${((buyingPower / equity) * 100).toFixed(1)}% of equity` : 'unavailable'} />
          <Metric label="Unrealized P&L" value={`${unrealized >= 0 ? '+' : '-'}$${Math.abs(unrealized).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} note="fixed demo FX into USD" />
          <Metric label="Day P&L" value={`${dayPnl >= 0 ? '+' : '-'}$${Math.abs(dayPnl).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} note={`${portfolio.data?.positions.length ?? 0} positions / fixed demo FX`} />
        </div>

        <div className="overview-primary-grid">
          <Card className="equity-card">
            <CardHeader title="Illustrative trajectory" eyebrow="STATIC UI SCENARIO - NOT ACCOUNT HISTORY" action={<StatusPill tone="neutral">Illustrative</StatusPill>} />
            <div className="chart-kpi-row"><div><strong>${equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong><span>Illustrative shape normalized to the current server snapshot</span></div></div>
            <FinancialChart values={curveValues} mode="area" height={282} positive />
          </Card>

          <Card className="watchlist-card">
            <CardHeader title="Global watchlist" eyebrow="YOUR ORBIT" action={<button className="text-action" onClick={() => navigate('/markets')}>View market <ChevronRight size={14} /></button>} />
            <div className="watchlist-list">
              {watchlist.map((item) => <button key={`${item.region}-${item.symbol}`} onClick={() => navigate(`/trade/${item.symbol}`)}>
                <SymbolAvatar symbol={item.symbol} color={item.color} />
                <span className="security-name"><strong>{item.symbol}</strong><small>{item.name}</small></span>
                <MarketTag region={item.region} />
                <Sparkline data={item.spark.slice(-24)} positive={item.changePct >= 0} width={76} height={28} id={`watch-${item.symbol}`} />
                <span className="watch-price"><strong>{item.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong><Change value={item.changePct} /></span>
              </button>)}
            </div>
            <div className="watchlist-footer"><span>SERVER MARKET UNIVERSE</span><small>Synthetic and delayed</small></div>
          </Card>
        </div>

        <div className="overview-secondary-grid">
          <Card className="movers-card">
            <CardHeader title="Momentum radar" eyebrow="CROSS-MARKET" action={<StatusPill tone="blue"><Globe2 size={12} /> 3 venues</StatusPill>} />
            <div className="mover-columns">
              <div><span className="column-label">LEADERS</span>{watchlist.filter((item) => item.changePct >= 0).sort((a, b) => b.changePct - a.changePct).slice(0, 3).map((item) => <button key={item.symbol} onClick={() => navigate(`/trade/${item.symbol}`)}><span><SymbolAvatar symbol={item.symbol} color={item.color} size="sm" /><strong>{item.symbol}</strong><MarketTag region={item.region} /></span><Change value={item.changePct} /></button>)}</div>
              <div><span className="column-label">LAGGARDS</span>{watchlist.filter((item) => item.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, 3).map((item) => <button key={item.symbol} onClick={() => navigate(`/trade/${item.symbol}`)}><span><SymbolAvatar symbol={item.symbol} color={item.color} size="sm" /><strong>{item.symbol}</strong><MarketTag region={item.region} /></span><Change value={item.changePct} /></button>)}</div>
            </div>
          </Card>

          <Card className="news-card">
            <CardHeader title="Illustrative market brief" eyebrow="STATIC SAMPLE CONTENT" action={<Newspaper size={16} />} />
            <div className="headline-list">{headlines.map((item) => <article key={item.title}><time>{item.time}</time><div><strong>{item.title}</strong><span>{item.source} {item.tags.map((tag) => <em key={tag}>{tag}</em>)}</span></div></article>)}</div>
          </Card>

          <Card className="ai-brief-card">
            <div className="ai-card-orb"><Sparkles size={20} /></div>
            <div className="eyebrow">SERVER AI ROUTE</div>
            <h2>Ask the configured research mode, with its identity disclosed after response.</h2>
            <p>AI Lab sends portfolio context through the local server and clearly distinguishes deterministic demo output from connected DeepSeek.</p>
            <div className="ai-signal-row"><span><Target size={14} /> contextual prompts</span><span><ShieldCheck size={14} /> browser has no credential</span></div>
            <Button variant="secondary" onClick={() => navigate('/ai-lab')}><Bot size={15} /> Open AI Lab <ChevronRight size={15} /></Button>
          </Card>
        </div>

        <Card className="session-strip">
          <div><CalendarClock size={18} /><span><strong>Simulation data clock</strong><small>{portfolio.data?.provenance ? `As of ${portfolio.data.provenance.asOf}` : 'Portfolio provenance unavailable'}</small></span></div>
          <div className="session-timeline"><span className="current">Synthetic data</span><i /><span>Local engine</span><i /><span>Paper orders</span><i /><span>No broker connection</span></div>
          <Button variant="ghost" disabled title="Market calendar is not available yet"><CircleDollarSign size={14} /> Calendar unavailable</Button>
        </Card>
      </>}
    </div>
  );
}
