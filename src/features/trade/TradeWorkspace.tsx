import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from '../../app/router';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, BarChart2, BellRing, BookOpen, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign,
  Clock3, Expand, Eye, Globe2, Info, LineChart, ListFilter, Maximize2, Minus, Plus,
  RotateCcw, Search, ShieldCheck, Star, WandSparkles, X, XCircle, Zap,
} from 'lucide-react';
import { ApiError, fixtureMode, useBootstrap, useEquities, useOrders, usePortfolio, useQuote, useSubmitOrder, type OrderSubmitResult } from '../../app/api';
import { currencySymbol, type Equity } from '../../app/data';
import { useAppStore } from '../../app/store';
import { FinancialChart, type FinancialChartHandle } from '../../components/FinancialChart';
import { buildExponentialMovingAverage, buildSyntheticChartSeries } from '../../components/chartSeries';
import { Button, Card, Change, ErrorState, LoadingState, MarketTag, Provenance, Sparkline, StatusPill, SymbolAvatar, cn } from '../../components/UI';

type OrderSide = 'Buy' | 'Sell';
type OrderType = 'Market' | 'Limit' | 'Stop' | 'Stop limit';
const chartRanges = [
  { label: '5D', count: 5 },
  { label: '1M', count: 30 },
  { label: '6W', count: 42 },
] as const;
type ChartRange = (typeof chartRanges)[number]['label'];
const workingOrderStatuses = new Set(['PENDING_VALIDATION', 'ACCEPTED', 'TRIGGERED', 'PARTIALLY_FILLED']);

const venueContext: Record<Equity['region'], { city: string; zone: string; fullZone: string }> = {
  US: { city: 'New York', zone: 'ET', fullZone: 'America/New_York' },
  HK: { city: 'Hong Kong', zone: 'HKT', fullZone: 'Asia/Hong_Kong' },
  CN: { city: 'Shanghai', zone: 'CST', fullZone: 'Asia/Shanghai' },
};

function OrderTicket({ equity, initialSide = 'Buy' }: { equity: Equity; initialSide?: OrderSide }) {
  const [side, setSide] = useState<OrderSide>(initialSide);
  const [type, setType] = useState<OrderType>('Limit');
  const [quantity, setQuantity] = useState(String(equity.boardLot ?? 1));
  const [limitPrice, setLimitPrice] = useState(equity.price.toFixed(2));
  const [stopPrice, setStopPrice] = useState((equity.price * .98).toFixed(2));
  const [duration, setDuration] = useState('Day');
  const [reviewing, setReviewing] = useState(false);
  const [result, setResult] = useState<OrderSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitOrder = useSubmitOrder();
  const portfolio = usePortfolio();
  const symbol = currencySymbol(equity.currency);
  const estimate = Number(quantity || 0) * (type === 'Market' ? equity.price : Number(limitPrice || equity.price));

  const review = () => {
    setResult(null);
    setError(null);
    if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
      setError('Enter a positive whole-share quantity.');
      return;
    }
    if ((type === 'Limit' || type === 'Stop limit') && !(Number(limitPrice) > 0)) {
      setError('Enter a valid positive limit price.');
      return;
    }
    if ((type === 'Stop' || type === 'Stop limit') && !(Number(stopPrice) > 0)) {
      setError('Enter a valid positive stop price.');
      return;
    }
    setReviewing(true);
  };

  const confirm = async () => {
    setError(null);
    try {
      const response = await submitOrder.mutateAsync({
        clientOrderId: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        symbol: equity.symbol,
        side: side.toUpperCase() as 'BUY' | 'SELL',
        type: type.toUpperCase().replace(' ', '_') as 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT',
        quantity: Number(quantity),
        timeInForce: duration.toUpperCase() as 'DAY' | 'GTC',
        ...(type === 'Limit' || type === 'Stop limit' ? { limitPrice } : {}),
        ...(type === 'Stop' || type === 'Stop limit' ? { stopPrice } : {}),
      });
      setResult(response);
      setReviewing(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? `${caught.message}${caught.code ? ` (${caught.code})` : ''}` : 'The simulated order could not be submitted.');
    }
  };

  return (
    <div className="order-ticket" data-testid="order-ticket">
      <div className="ticket-heading"><div><span className="eyebrow">ORDER TICKET</span><strong>{equity.symbol} <small>{equity.exchange}</small></strong></div><button aria-label="Reset ticket" onClick={() => { setQuantity('20'); setLimitPrice(equity.price.toFixed(2)); }}><RotateCcw size={14} /></button></div>
      <div className="side-switch"><button data-testid="order-side-buy" className={cn(side === 'Buy' && 'buy-active')} onClick={() => { setSide('Buy'); setReviewing(false); }}>Buy</button><button data-testid="order-side-sell" className={cn(side === 'Sell' && 'sell-active')} onClick={() => { setSide('Sell'); setReviewing(false); }}>Sell</button></div>

      <label className="ticket-field"><span>Order type <Info size={12} /></span><div className="select-like"><select value={type} onChange={(event) => setType(event.target.value as OrderType)}><option>Market</option><option>Limit</option><option>Stop</option><option>Stop limit</option></select><ChevronDown size={14} /></div></label>
      <label className="ticket-field"><span>Quantity <small>shares</small></span><div className="stepper"><button onClick={() => setQuantity(String(Math.max(0, Number(quantity) - 1)))} aria-label="Decrease quantity"><Minus size={13} /></button><input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^0-9]/g, ''))} aria-label="Quantity" /><button onClick={() => setQuantity(String(Number(quantity) + 1))} aria-label="Increase quantity"><Plus size={13} /></button></div></label>
      {(type === 'Limit' || type === 'Stop limit') && <label className="ticket-field"><span>Limit price <small>{equity.currency}</small></span><div className="money-input"><span>{symbol}</span><input inputMode="decimal" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} aria-label="Limit price" /></div></label>}
      {(type === 'Stop' || type === 'Stop limit') && <label className="ticket-field"><span>Stop price <small>{equity.currency}</small></span><div className="money-input"><span>{symbol}</span><input inputMode="decimal" value={stopPrice} onChange={(event) => setStopPrice(event.target.value)} aria-label="Stop price" /></div></label>}
      <label className="ticket-field"><span>Time in force</span><div className="ticket-pills"><button className={cn(duration === 'Day' && 'active')} onClick={() => setDuration('Day')}>Day</button><button className={cn(duration === 'GTC' && 'active')} onClick={() => setDuration('GTC')}>GTC</button></div></label>

      <div className="ticket-summary"><div><span>Estimated value</span><strong>{symbol}{estimate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div><div><span>Available buying power</span><strong>{portfolio.data ? `$${portfolio.data.buyingPower.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'Unavailable'}</strong></div><div><span>Execution model</span><strong>Synthetic paper only</strong></div></div>
      {reviewing && <div className="order-review-panel" data-testid="order-review-panel"><strong>Confirm simulated {side.toLowerCase()}</strong><p>{quantity} share{Number(quantity) === 1 ? '' : 's'} of {equity.symbol} / {type} / {duration}</p><span>Estimated value: {symbol}{estimate.toLocaleString('en-US', { minimumFractionDigits: 2 })} <b>{equity.currency}</b></span><div><Button variant="ghost" onClick={() => setReviewing(false)}>Back</Button><Button variant="primary" data-testid="order-confirm" onClick={() => void confirm()} disabled={submitOrder.isPending}>{submitOrder.isPending ? 'Submitting...' : 'Confirm paper order'}</Button></div></div>}
      {error && <div className="order-error" role="alert" data-testid="order-error"><Info size={14} /><span>{error}</span></div>}
      <AnimatePresence>{result && <motion.div className={cn('order-result', result.order.status === 'REJECTED' && 'rejected')} data-testid="order-result" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><div>{result.order.status === 'REJECTED' ? <XCircle size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}<span><strong>{result.order.status === 'REJECTED' ? 'Order rejected' : result.order.displayStatus}</strong><small>{result.order.statusReason ?? `Order ${result.order.id}`}</small></span></div><ol aria-label="Order lifecycle events">{result.events.map((event) => <li key={event.id}><span>{event.type.replaceAll('_', ' ')}</span><small>{event.message}</small></li>)}</ol></motion.div>}</AnimatePresence>
      {!reviewing && <Button variant="primary" data-testid="order-review" className={cn('review-order', side === 'Sell' && 'sell-order')} onClick={review} disabled={fixtureMode || submitOrder.isPending}>{fixtureMode ? 'Unavailable in fixture mode' : <>Review {side.toLowerCase()} order <ChevronRight size={16} /></>}</Button>}
      <p className="ticket-disclosure"><ShieldCheck size={13} /> No real funds or securities are involved.</p>
    </div>
  );
}

function OrderBook({ equity }: { equity: Equity }) {
  const [view, setView] = useState<'Book' | 'Trades'>('Book');
  const levels = useMemo(() => Array.from({ length: 7 }, (_, index) => ({
    ask: equity.price + (7 - index) * .05,
    bid: equity.price - (index + 1) * .05,
    askSize: 130 + ((index * 83) % 720),
    bidSize: 110 + ((index * 127) % 680),
  })), [equity.price]);
  return (
    <Card className="orderbook-card">
      <div className="micro-tabs"><button className={cn(view === 'Book' && 'active')} onClick={() => setView('Book')}><BookOpen size={13} /> Est. book</button><button className={cn(view === 'Trades' && 'active')} onClick={() => setView('Trades')}><Activity size={13} /> Est. tape</button></div>
      {view === 'Book' ? <>
        <div className="book-head"><span>Price</span><span>Size</span><span>Total</span></div>
        <div className="ask-levels">{levels.slice(0, 6).map((level, index) => <div className="book-row" key={`a-${index}`}><i style={{ width: `${26 + index * 10}%` }} /><span>{level.ask.toFixed(2)}</span><span>{level.askSize}</span><span>{(level.askSize * (index + 1)).toLocaleString()}</span></div>)}</div>
        <div className="book-mid"><span>{equity.price.toFixed(2)}</span><Change value={equity.changePct} /><small>spread 0.05</small></div>
        <div className="bid-levels">{levels.slice(0, 6).map((level, index) => <div className="book-row" key={`b-${index}`}><i style={{ width: `${76 - index * 7}%` }} /><span>{level.bid.toFixed(2)}</span><span>{level.bidSize}</span><span>{(level.bidSize * (index + 2)).toLocaleString()}</span></div>)}</div>
        <div className="book-ratio"><span><i style={{ width: '58%' }} /></span><div><strong>58%</strong> buy pressure <b>42%</b></div></div>
      </> : <div className="tape-list">{Array.from({ length: 12 }, (_, index) => { const up = index % 3 !== 0; return <div key={index}><span className={up ? 'is-gain' : 'is-loss'}>{(equity.price + (up ? .05 : -.05) * index).toFixed(2)}</span><span>{80 + index * 37}</span><time>14:{String(32 - index).padStart(2, '0')}:0{index % 9}</time></div>; })}</div>}
    </Card>
  );
}

function InstrumentWatchlist({ active }: { active: string }) {
  const navigate = useNavigate();
  const universe = useEquities();
  const items = universe.data ?? [];
  return <Card className="trade-watchlist"><div className="trade-watch-head"><strong>Market list</strong><div><button aria-label="Search watchlist" disabled title="Search filters are not available yet"><Search size={14} /></button><button aria-label="Filter watchlist" disabled title="List filters are not available yet"><ListFilter size={14} /></button></div></div><div className="trade-watch-items">{items.map((item) => <button key={`${item.region}-${item.symbol}`} className={cn(active === item.symbol && 'active')} onClick={() => navigate(`/trade/${item.symbol}`)}><span className="watch-symbol-line"><SymbolAvatar symbol={item.symbol} color={item.color} size="sm" /><span><strong>{item.symbol}</strong><small>{item.name}</small></span><MarketTag region={item.region} /></span><span className="watch-quote-line"><strong>{item.price.toFixed(2)}</strong><Sparkline data={item.spark.slice(-18)} positive={item.changePct >= 0} width={54} height={22} id={`trade-watch-${item.symbol}`} /><Change value={item.changePct} /></span></button>)}</div><button className="watch-add" disabled title="Custom watchlists are coming later"><Plus size={14} /> Custom lists unavailable</button></Card>;
}

function MobileTicket({ equity }: { equity: Equity }) {
  const open = useAppStore((state) => state.mobileTicketOpen);
  const setOpen = useAppStore((state) => state.setMobileTicketOpen);
  const [side, setSide] = useState<OrderSide>('Buy');
  return <><div className="mobile-trade-bar" data-testid="mobile-trade-bar"><div><strong>{equity.symbol}</strong><span>{equity.price.toFixed(2)} <Change value={equity.changePct} /></span></div><button className="mobile-buy" onClick={() => { setSide('Buy'); setOpen(true); }}>Buy</button><button className="mobile-sell" onClick={() => { setSide('Sell'); setOpen(true); }}>Sell</button></div><Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="mobile-ticket-dialog"><div className="sheet-handle" /><Dialog.Title className="sr-only">Trade {equity.symbol}</Dialog.Title><Dialog.Description className="sr-only">Create a simulated stock order</Dialog.Description><Dialog.Close className="sheet-close" aria-label="Close order ticket"><X size={18} /></Dialog.Close><OrderTicket key={`${equity.symbol}-${side}`} equity={equity} initialSide={side} /></Dialog.Content></Dialog.Portal></Dialog.Root></>;
}

export function TradeWorkspace() {
  const { symbol = 'NVDA' } = useParams();
  const normalized = symbol.toUpperCase();
  const quote = useQuote(normalized);
  const bootstrap = useBootstrap();
  const portfolio = usePortfolio();
  const orders = useOrders();
  const setSelected = useAppStore((state) => state.setSelectedSymbol);
  const [range, setRange] = useState<ChartRange>('6W');
  const [chartMode, setChartMode] = useState<'candles' | 'area'>('candles');
  const [showEma, setShowEma] = useState(true);
  const [starred, setStarred] = useState(true);
  const chartRef = useRef<FinancialChartHandle>(null);
  useEffect(() => setSelected(normalized), [normalized, setSelected]);

  if (quote.isLoading) return <div className="page"><LoadingState rows={7} /></div>;
  if (quote.isError || !quote.data) return <div className="page"><ErrorState onRetry={() => void quote.refetch()} /></div>;
  const equity = quote.data;
  const cs = currencySymbol(equity.currency);
  const lastHistoryPrice = equity.spark.at(-1);
  const quoteAdjustment = lastHistoryPrice === undefined ? 0 : equity.price - lastHistoryPrice;
  const fullChartValues = equity.spark.length
    ? equity.spark.map((value) => Number((value + quoteAdjustment).toFixed(4)))
    : [equity.price];
  const selectedRange = chartRanges.find((item) => item.label === range) ?? chartRanges.at(-1)!;
  const chartValues = fullChartValues.slice(-selectedRange.count);
  const chartStartOffset = Math.max(0, fullChartValues.length - chartValues.length);
  const chartSeries = buildSyntheticChartSeries(chartValues, chartStartOffset);
  const latestCandle = chartSeries.candles.at(-1)!;
  const latestVolume = chartSeries.volumes.at(-1) ?? 0;
  const latestEma = buildExponentialMovingAverage(chartSeries.candles, 20).at(-1)?.value;
  const selectedPosition = portfolio.data?.positions.find((position) => position.symbol === equity.symbol);
  const workingForSymbol = (orders.data ?? []).filter((order) => order.symbol === equity.symbol && workingOrderStatuses.has(order.status));
  const latestWorkingOrder = workingForSymbol.at(0);
  const positionCurrency = selectedPosition?.currency ?? equity.currency;
  const positionMarker = selectedPosition ? `POS ${selectedPosition.shares} @ ${selectedPosition.avg.toFixed(2)}` : undefined;
  const workingOrderMarker = latestWorkingOrder
    ? `${latestWorkingOrder.displaySide.toUpperCase()} ${latestWorkingOrder.quantity}${latestWorkingOrder.price ? ` @ ${latestWorkingOrder.price.toFixed(2)}` : ' MKT'}`
    : undefined;
  const session = bootstrap.data?.markets.find((market) => (market.region ?? market.market) === equity.region)?.session;
  const venue = venueContext[equity.region];
  const sessionLabel = session ? `${session.phase.replaceAll('_', ' ').toLowerCase()} / ${session.localTime} local` : 'Session state unavailable';
  const sourceAsOf = equity.quote?.at ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(equity.quote.at)) : 'unavailable';
  const sessionOpen = fullChartValues[0] ?? equity.price;
  const sessionHigh = Math.max(...fullChartValues, equity.price);
  const sessionLow = Math.min(...fullChartValues, equity.price);

  return (
    <div className="trade-page" data-testid="trade-page">
      <div className="trade-instrument-bar">
        <div className="instrument-identity"><SymbolAvatar symbol={equity.symbol} color={equity.color} size="lg" /><div><div><h1>{equity.symbol}</h1><MarketTag region={equity.region} /><StatusPill tone="neutral">{equity.exchange}</StatusPill></div><span>{equity.name} / {equity.currency}</span></div><button className={cn('star-button', starred && 'active')} onClick={() => setStarred(!starred)} aria-label="Toggle watchlist"><Star size={17} fill={starred ? 'currentColor' : 'none'} /></button></div>
        <div className="instrument-price"><strong data-testid="instrument-last-price">{cs}{equity.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong><Change value={equity.change} suffix={` (${equity.changePct > 0 ? '+' : ''}${equity.changePct.toFixed(2)}%)`} showIcon /><small>Quote as of {sourceAsOf} UTC</small></div>
        <div className="instrument-stats"><div><span>Open</span><strong>{sessionOpen.toFixed(2)}</strong></div><div><span>High</span><strong>{sessionHigh.toFixed(2)}</strong></div><div><span>Low</span><strong>{sessionLow.toFixed(2)}</strong></div><div><span>Volume</span><strong>{equity.volume}</strong></div><div><span>Mkt cap</span><strong>{equity.marketCap}</strong></div></div>
        <div className="instrument-tools"><button disabled title="Price alerts are not available yet"><BellRing size={15} /> Alert</button><button disabled title="Open AI Lab to analyze this instrument"><Eye size={15} /> Analyze</button><button aria-label="Expand" disabled title="Fullscreen charts are not available yet"><Expand size={15} /></button></div>
      </div>

      <div className="trade-status-row"><span className="venue-timezone" title={`Exchange clock: ${venue.fullZone}`}><Globe2 size={13} /><strong>{equity.region}</strong> {venue.city} / {venue.zone}</span><Provenance compact /><span><Clock3 size={13} /> {sessionLabel}</span><span className="trade-latency"><Zap size={12} /> local simulation API</span></div>

      <div className="trade-grid">
        <InstrumentWatchlist active={equity.symbol} />
        <div className="trade-center">
          <Card className="chart-card">
            <div className="chart-toolbar"><div className="chart-range-controls"><div className="range-switch">{chartRanges.map((item) => <button key={item.label} className={cn(range === item.label && 'active')} aria-pressed={range === item.label} title={`${item.count} daily synthetic bars`} onClick={() => setRange(item.label)}>{item.label}</button>)}</div><span className="chart-interval-badge">1D bars</span></div><div className="chart-tools"><button className={cn(chartMode === 'candles' && 'active')} aria-label="Show candlesticks" aria-pressed={chartMode === 'candles'} onClick={() => setChartMode('candles')} title="Candlesticks"><BarChart2 size={15} /></button><button className={cn(chartMode === 'area' && 'active')} aria-label="Show area chart" aria-pressed={chartMode === 'area'} onClick={() => setChartMode('area')} title="Area chart"><LineChart size={15} /></button><span /><button className={cn('chart-indicator-toggle', showEma && 'active')} aria-label="Toggle EMA 20 indicator" aria-pressed={showEma} onClick={() => setShowEma((value) => !value)} title="Exponential moving average from the visible synthetic closes"><Activity size={14} /><small>EMA20</small></button><span /><button className="chart-reset-view" aria-label="Reset chart view" onClick={() => chartRef.current?.resetView()} title="Reset pan and zoom"><RotateCcw size={14} /></button><button title="Fullscreen charts are not available yet" disabled aria-label="Fullscreen chart unavailable"><Maximize2 size={15} /></button></div></div>
            <div className="chart-hover-readout" aria-label="Latest synthetic daily bar"><em>Latest</em><span>O <b>{latestCandle.open.toFixed(2)}</b></span><span>H <b>{latestCandle.high.toFixed(2)}</b></span><span>L <b>{latestCandle.low.toFixed(2)}</b></span><span>C <b>{latestCandle.close.toFixed(2)}</b></span><span>Vol est. <b>{Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(latestVolume)}</b></span>{showEma && latestEma !== undefined && <span className="chart-ema-readout"><i /> EMA20 <b>{latestEma.toFixed(2)}</b></span>}<span className="chart-position-context"><b>{selectedPosition ? `${selectedPosition.shares} sh @ ${selectedPosition.avg.toFixed(2)} ${positionCurrency}` : 'Flat'}</b><i />{workingForSymbol.length ? `${workingForSymbol.length} working` : 'No working orders'}</span></div>
            <FinancialChart ref={chartRef} values={chartValues} startOffset={chartStartOffset} mode={chartMode} height={378} positive={equity.changePct >= 0} showEma={showEma} positionMarker={positionMarker} workingOrderMarker={workingOrderMarker} />
          </Card>
          <div className="instrument-context-grid">
            <Card><div className="mini-card-head"><span>Key statistics</span><CircleDollarSign size={15} /></div><div className="stat-pairs"><span>P/E (TTM)<strong>47.62</strong></span><span>EPS (TTM)<strong>3.71</strong></span><span>52W high<strong>{cs}{(equity.price * 1.13).toFixed(2)}</strong></span><span>52W low<strong>{cs}{(equity.price * .58).toFixed(2)}</strong></span></div></Card>
            <Card className="signal-card"><div className="mini-card-head"><span>Illustrative signal lens</span><WandSparkles size={15} /></div><p>Rule-based reading of the synthetic series only. Open AI Lab for a server-generated research response.</p><div><StatusPill tone="neutral">Deterministic</StatusPill><StatusPill tone="warn">Not advice</StatusPill></div></Card>
          </div>
        </div>
        <OrderBook equity={equity} />
        <Card className="ticket-card"><OrderTicket key={equity.symbol} equity={equity} /></Card>
      </div>
      <MobileTicket equity={equity} />
    </div>
  );
}
