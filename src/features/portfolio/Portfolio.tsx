import { ArrowRightLeft, ChartPie, ChevronRight, CircleGauge, Download, Gauge, Info, Landmark, MoveHorizontal, RefreshCcw, ShieldAlert, Target } from 'lucide-react';
import { useNavigate } from '../../app/router';
import { usePortfolio } from '../../app/api';
import { equities, portfolioCurve } from '../../app/data';
import { FinancialChart } from '../../components/FinancialChart';
import { Button, Card, CardHeader, Change, ErrorState, LoadingState, MarketTag, Metric, PageHeader, Provenance, StatusPill, SymbolAvatar } from '../../components/UI';

const allocation = [
  { label: 'Semiconductors', value: 31, color: '#648cf0' },
  { label: 'China internet', value: 24, color: '#42bda0' },
  { label: 'New energy', value: 17, color: '#86a7f5' },
  { label: 'Software', value: 13, color: '#d29b65' },
  { label: 'Cash', value: 15, color: '#445064' },
];

export function Portfolio() {
  const portfolio = usePortfolio();
  const navigate = useNavigate();
  if (portfolio.isLoading) return <div className="page"><LoadingState rows={8} /></div>;
  if (portfolio.isError) return <div className="page"><ErrorState onRetry={() => void portfolio.refetch()} /></div>;
  const positions = portfolio.data?.positions ?? [];
  const unrealized = positions.reduce((sum, position) => sum + (position.pnlBase ?? 0), 0);
  const day = positions.reduce((sum, position) => sum + (position.dayBase ?? 0), 0);
  const equity = portfolio.data?.equity ?? 0;
  const curveAnchor = portfolioCurve.at(-1)?.value ?? 1;
  const normalizedCurve = portfolioCurve.map((point) => equity ? Number((point.value / curveAnchor * equity).toFixed(2)) : point.value);
  const regionCounts = { US: positions.filter((position) => position.region === 'US').length, HK: positions.filter((position) => position.region === 'HK').length, CN: positions.filter((position) => position.region === 'CN').length };
  const regionPct = (count: number) => positions.length ? Math.round((count / positions.length) * 100) : 0;
  return (
    <div className="page portfolio-page" data-testid="portfolio-page">
      <PageHeader eyebrow="PAPER ACCOUNT - SERVER SNAPSHOT" title="Portfolio" description="Persisted holdings returned by the local simulation engine." actions={<><Button variant="ghost" disabled title="Portfolio export is not available yet"><Download size={14} /> Export unavailable</Button><Button onClick={() => void portfolio.refetch()}><RefreshCcw size={14} /> Refresh API data</Button></>} />
      <Provenance />
      <div className="metric-grid portfolio-metrics">
        <Metric label="Net liquidation" value={`$${(portfolio.data?.equity ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} note="server-calculated USD" accent />
        <Metric label="Unrealized P&L" value={`${unrealized >= 0 ? '+' : '-'}$${Math.abs(unrealized).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} note="server-converted at fixed demo FX" />
        <Metric label="Day P&L" value={`${day >= 0 ? '+' : '-'}$${Math.abs(day).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} note="server-converted at fixed demo FX" />
        <Metric label="Buying power" value={`$${(portfolio.data?.buyingPower ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} note="server-calculated USD" />
      </div>

      <div className="portfolio-overview-grid">
        <Card className="portfolio-performance-card">
          <CardHeader title="Illustrative equity trajectory" eyebrow="STATIC UI SAMPLE - NO HISTORY ENDPOINT" action={<StatusPill tone="neutral">Illustrative</StatusPill>} />
          <div className="portfolio-chart-summary"><div><strong>${equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong><span>Illustrative shape normalized to the current server value</span></div></div>
          <FinancialChart values={normalizedCurve} mode="area" height={286} />
        </Card>
        <Card className="allocation-card">
          <CardHeader title="Illustrative allocation" eyebrow="STATIC SAMPLE - NOT DERIVED" action={<ChartPie size={16} />} />
          <div className="allocation-content"><div className="allocation-donut"><div><strong>85%</strong><span>invested</span></div></div><div className="allocation-legend">{allocation.map((item) => <div key={item.label}><span style={{ background: item.color }} /><strong>{item.label}</strong><b>{item.value}%</b></div>)}</div></div>
          <div className="allocation-note"><Info size={14} /> Top two themes represent 55% of invested capital.</div>
        </Card>
      </div>

      <Card className="positions-card">
        <CardHeader title="Open positions" eyebrow={`${positions.length} SERVER POSITIONS`} action={<Button variant="ghost" disabled title="Portfolio rebalancing is not available yet"><ArrowRightLeft size={14} /> Rebalance unavailable</Button>} />
        <div className="positions-scroll-shell">
          <div className="positions-scroll-cue" id="positions-scroll-help">
            <MoveHorizontal size={17} aria-hidden="true" />
            <span><strong>Swipe to inspect every column</strong><small>Native price, market value, and P&amp;L continue to the right.</small></span>
          </div>
          <div className="data-table positions-table" role="region" aria-label="Open positions table" aria-describedby="positions-scroll-help" tabIndex={0} data-testid="positions-scroll-region">
            <div className="table-head"><span>Instrument</span><span>Position</span><span>Avg. price</span><span>Last</span><span>Market value</span><span>Day P&L</span><span>Total P&L</span><span /></div>
            {positions.map((position) => { const item = equities.find((entry) => entry.symbol === position.symbol); const currency = position.currency ?? (position.region === 'US' ? 'USD' : position.region === 'HK' ? 'HKD' : 'CNY'); return <button className="table-row" key={position.symbol} onClick={() => navigate(`/trade/${position.symbol}`)}><span className="instrument-cell"><SymbolAvatar symbol={position.symbol} color={item?.color} /><span><strong>{position.symbol}</strong><small>{position.name}</small></span><MarketTag region={position.region} /></span><span className="number-cell"><strong>{position.shares.toLocaleString()}</strong><small>shares</small></span><span>{position.avg.toFixed(2)} {currency}</span><span>{position.price.toFixed(2)} {currency}</span><span className="number-cell"><strong>{(position.price * position.shares).toLocaleString('en-US', { maximumFractionDigits: 0 })} {currency}</strong><small>{position.region} exposure</small></span><Change value={position.day} suffix={` ${currency}`} /><span className="position-total"><Change value={position.pnl} suffix={` ${currency}`} /><small>{position.pnlPct > 0 ? '+' : ''}{position.pnlPct.toFixed(2)}%</small></span><ChevronRight size={15} /></button>; })}
          </div>
        </div>
      </Card>

      <div className="portfolio-insight-grid">
        <Card>
          <CardHeader title="Regional exposure" eyebrow="GEOGRAPHY" action={<Landmark size={16} />} />
          <div className="region-bars"><div><span><b>US</b> United States</span><strong>{regionPct(regionCounts.US)}%</strong><i><em style={{ width: `${regionPct(regionCounts.US)}%` }} /></i></div><div><span><b>HK</b> Hong Kong</span><strong>{regionPct(regionCounts.HK)}%</strong><i><em style={{ width: `${regionPct(regionCounts.HK)}%` }} /></i></div><div><span><b>CN</b> Mainland China</span><strong>{regionPct(regionCounts.CN)}%</strong><i><em style={{ width: `${regionPct(regionCounts.CN)}%` }} /></i></div></div>
          <footer><span>Method</span><strong>Share of open position count</strong></footer>
        </Card>
        <Card>
          <CardHeader title="Illustrative risk monitor" eyebrow="STATIC SAMPLE - NOT CALCULATED" action={<CircleGauge size={16} />} />
          <div className="risk-grid"><div><Gauge size={16} /><span>Beta<strong>1.08</strong><small>vs blended index</small></span></div><div><ShieldAlert size={16} /><span>95% VaR<strong>$12.4k</strong><small>1-day estimate</small></span></div><div><Target size={16} /><span>Sharpe<strong>1.42</strong><small>annualized</small></span></div><div><RefreshCcw size={16} /><span>Turnover<strong>18.6%</strong><small>this month</small></span></div></div>
        </Card>
        <Card className="scenario-card">
          <CardHeader title="Illustrative scenario lens" eyebrow="STATIC UI SAMPLE" action={<StatusPill tone="neutral">Not calculated</StatusPill>} />
          <p>A synchronized 5% semiconductor pullback would imply an estimated <strong className="is-loss">−$13,366</strong> portfolio impact.</p>
          <div className="scenario-scale"><span>Current</span><i><em /></i><span>−1.55%</span></div>
          <Button variant="secondary" onClick={() => navigate('/ai-lab')}>Stress-test portfolio <ChevronRight size={15} /></Button>
        </Card>
      </div>
    </div>
  );
}
