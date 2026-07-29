import { useMemo, useState } from 'react';
import { ArrowUpDown, BarChart3, ChevronRight, Filter, Globe2, Layers3, Scale, Search, SlidersHorizontal, Waves } from 'lucide-react';
import { useNavigate } from '../../app/router';
import { useBootstrap, useEquities, useMarketIndices } from '../../app/api';
import { sectors, type Region } from '../../app/data';
import { Button, Card, CardHeader, Change, ErrorState, LoadingState, MarketTag, PageHeader, Provenance, Sparkline, StatusPill, SymbolAvatar, TabsRow, cn } from '../../components/UI';

const regionCopy: Record<Region, {
  title: string;
  session: string;
  breadth: string;
  advance: number;
  venue: string;
  rules: { lot: string; tick: string; limit: string; settlement: string };
}> = {
  US: {
    title: 'United States', session: 'Pre-market', breadth: 'Constructive', advance: 67, venue: 'NYSE / NASDAQ',
    rules: { lot: '1-share increments', tick: 'USD 0.01 at or above USD 1', limit: 'No universal daily band', settlement: 'T+1 rule metadata' },
  },
  HK: {
    title: 'Hong Kong', session: 'Closed', breadth: 'Risk-on', advance: 72, venue: 'HKEX',
    rules: { lot: 'Instrument board lots', tick: 'Price-dependent HKEX spread', limit: 'No universal daily band', settlement: 'T+2 rule metadata' },
  },
  CN: {
    title: 'Mainland China', session: 'Closed', breadth: 'Selective', advance: 58, venue: 'SSE / SZSE / STAR',
    rules: { lot: '100-share buys by default', tick: 'CNY 0.01 equities', limit: 'Board-specific 5-20%', settlement: 'T+1 sell availability' },
  },
};

export function Markets() {
  const [region, setRegion] = useState<Region>('US');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'change' | 'volume'>('change');
  const navigate = useNavigate();
  const indices = useMarketIndices(region);
  const stocks = useEquities(region);
  const allStocks = useEquities();
  const bootstrap = useBootstrap();
  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return [...(stocks.data ?? [])].filter((item) => `${item.symbol} ${item.name}`.toLowerCase().includes(needle)).sort((a, b) => sort === 'change' ? b.changePct - a.changePct : b.volume.localeCompare(a.volume));
  }, [query, sort, stocks.data]);
  const context = regionCopy[region];
  const session = bootstrap.data?.markets.find((market) => (market.region ?? market.market) === region)?.session;
  const sessionLabel = session ? session.phase.replaceAll('_', ' ').toLowerCase() : 'unavailable';

  return (
    <div className="page markets-page" data-testid="markets-page">
      <PageHeader eyebrow="GLOBAL DISCOVERY" title="Markets" description="The complete synthetic universe returned by the local server." actions={<Button disabled title="Custom market layouts are not available yet"><SlidersHorizontal size={15} /> Fixed view</Button>} />
      <div className="markets-toolbar">
        <div data-testid="market-region-tabs"><TabsRow value={region} onChange={setRegion} label="Market region" items={[{ value: 'US', label: 'United States' }, { value: 'HK', label: 'Hong Kong' }, { value: 'CN', label: 'Mainland China' }]} /></div>
        <Provenance compact />
      </div>

      {indices.isLoading ? <LoadingState rows={2} /> : indices.isError ? <ErrorState onRetry={() => void indices.refetch()} /> : <>
        <div className="index-grid">
          {indices.data?.map((index) => <Card className="index-card" key={index.symbol}>
            <div className="index-top"><div><span>{index.name}</span><small>{index.symbol}</small></div><StatusPill tone={session?.phase !== 'CLOSED' ? 'good' : 'neutral'}><span className={cn('session-dot', session?.phase !== 'CLOSED' && 'open')} /> {sessionLabel}</StatusPill></div>
            <div className="index-body"><div><strong>{index.value}</strong><Change value={index.change} showIcon /></div><Sparkline data={index.spark} positive={index.change >= 0} width={132} height={48} id={`${region}-${index.symbol}`} /></div>
          </Card>)}
          <Card className="breadth-card">
            <div className="breadth-heading"><span><Waves size={15} /> Market breadth</span><strong>{context.breadth}</strong></div>
            <div className="breadth-score"><div><strong>{context.advance}%</strong><small>advancing</small></div><div className="breadth-gauge"><span style={{ width: `${context.advance}%` }} /></div><div className="breadth-legend"><span>{context.advance} adv</span><span>{100 - context.advance} dec</span></div></div>
          </Card>
        </div>

        <div className="markets-main-grid">
          <Card className="market-table-card">
            <CardHeader title={`${context.title} movers`} eyebrow={context.venue} action={<div className="table-tools"><label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter symbols" /></label><button aria-label="Filter"><Filter size={15} /></button></div>} />
            {stocks.isLoading ? <LoadingState rows={2} /> : stocks.isError ? <ErrorState onRetry={() => void stocks.refetch()} /> : <div className="data-table market-table">
              <div className="table-head"><span>Instrument</span><span>Last</span><button onClick={() => setSort('change')}>Change <ArrowUpDown size={11} /></button><span>Intraday</span><span>Volume</span><span>Market cap</span><span /></div>
              {filtered.map((item) => <button className="table-row" key={item.symbol} onClick={() => navigate(`/trade/${item.symbol}`)}>
                <span className="instrument-cell"><SymbolAvatar symbol={item.symbol} color={item.color} /><span><strong>{item.symbol}</strong><small>{item.name}</small></span><MarketTag region={item.region} /></span>
                <span className="number-cell"><strong>{item.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong><small>{item.currency}</small></span>
                <Change value={item.changePct} />
                <Sparkline data={item.spark.slice(-28)} positive={item.changePct >= 0} width={96} height={30} id={`market-${item.symbol}`} />
                <span className="number-cell"><strong>{item.volume}</strong><small>shares</small></span>
                <span className="number-cell"><strong>{item.marketCap}</strong><small>{item.currency}</small></span>
                <ChevronRight size={15} />
              </button>)}
              {!filtered.length && <div className="table-empty">No securities match &quot;{query}&quot;.</div>}
            </div>}
            <div className="market-table-context"><div><span>Demo coverage</span><strong>{stocks.data?.length ?? 0} instruments</strong><small>The server intentionally exposes a compact deterministic universe.</small></div><div><span>Session state</span><strong>{sessionLabel}</strong><small>{session ? `${session.marketDate} at ${session.localTime} local` : 'Bootstrap session unavailable'}</small></div><div><span>Data source</span><strong>{bootstrap.data?.provenance.classification ?? 'Unavailable'}</strong><small>{bootstrap.data?.provenance.source ?? 'Bootstrap provenance unavailable'}</small></div></div>
            <section className="market-rule-lens" aria-labelledby="market-rule-lens-title">
              <div className="market-rule-heading"><span><Scale size={15} /> Simulator rule lens</span><strong id="market-rule-lens-title">{context.title}</strong><small>Effective 28 Jul 2026 · educational simplification</small></div>
              <div className="market-rule-grid">
                <div><span>Order lot</span><strong>{context.rules.lot}</strong></div>
                <div><span>Tick profile</span><strong>{context.rules.tick}</strong></div>
                <div><span>Price band</span><strong>{context.rules.limit}</strong></div>
                <div><span>Settlement</span><strong>{context.rules.settlement}</strong></div>
              </div>
            </section>
            <footer className="table-footer"><span>Showing {filtered.length} liquid instruments</span><button onClick={() => setSort(sort === 'change' ? 'volume' : 'change')}>Sorted by {sort} <ArrowUpDown size={12} /></button></footer>
          </Card>

          <div className="markets-side">
            <Card className="sector-card">
              <CardHeader title="Illustrative sector pulse" eyebrow="STATIC SAMPLE - NOT LIVE BREADTH" action={<Layers3 size={16} />} />
              <div className="sector-map">{sectors.map((sector) => <button key={sector.name} className={cn(sector.change >= 0 ? 'sector-up' : 'sector-down')} style={{ flexGrow: sector.weight }}><strong>{sector.name}</strong><Change value={sector.change} /></button>)}</div>
              <div className="sector-scale"><span>-3%</span><i /><span>0</span><i /><span>+4%</span></div>
            </Card>
            <Card className="market-context-card">
              <CardHeader title="Session context" eyebrow="AT A GLANCE" action={<Globe2 size={16} />} />
              <div className="context-stat"><span>Primary session</span><strong>{sessionLabel}</strong></div>
              <div className="context-stat"><span>Venue coverage</span><strong>{context.venue}</strong></div>
              <div className="context-stat"><span>Instruments returned</span><strong>{stocks.data?.length ?? 0}</strong></div>
              <div className="context-stat"><span>Data class</span><strong className="context-positive">{bootstrap.data?.provenance.classification ?? 'Unavailable'}</strong></div>
              <div className="context-note"><BarChart3 size={16} /><p><strong>Trust boundary</strong>Index cards and securities are server data. The sector heatmap is visibly marked as a static visual sample.</p></div>
            </Card>
          </div>
        </div>
        <Card className="market-universe-strip"><CardHeader title="Server universe" eyebrow={`${allStocks.data?.length ?? 0} SYNTHETIC INSTRUMENTS`} action={<StatusPill tone="neutral">Complete demo coverage</StatusPill>} /><div>{(allStocks.data ?? []).map((item) => <button key={`${item.region}-${item.symbol}`} onClick={() => navigate(`/trade/${item.symbol}`)}><SymbolAvatar symbol={item.symbol} color={item.color} /><span><strong>{item.symbol}</strong><small>{item.name}</small></span><MarketTag region={item.region} /><Change value={item.changePct} /></button>)}</div></Card>
      </>}
    </div>
  );
}
