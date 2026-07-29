import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Bot, BriefcaseBusiness, ChartNoAxesCombined, FileClock, Gauge, Search, TrendingUp, X } from 'lucide-react';
import { useEquities } from '../app/api';
import { useNavigate } from '../app/router';
import { useAppStore } from '../app/store';
import { MarketTag, SymbolAvatar, cn } from './UI';

const pages = [
  { label: 'Overview', hint: 'Portfolio command center', path: '/', icon: Gauge },
  { label: 'Markets', hint: 'US, Hong Kong & Mainland', path: '/markets', icon: ChartNoAxesCombined },
  { label: 'Trade', hint: 'Instrument workspace', path: '/trade/NVDA', icon: TrendingUp },
  { label: 'Portfolio', hint: 'Positions & allocation', path: '/portfolio', icon: BriefcaseBusiness },
  { label: 'Orders', hint: 'Activity & decision journal', path: '/orders', icon: FileClock },
  { label: 'AI Lab', hint: 'Research copilot', path: '/ai-lab', icon: Bot },
];

export function CommandPalette() {
  const open = useAppStore((state) => state.commandOpen);
  const setOpen = useAppStore((state) => state.setCommandOpen);
  const setSelected = useAppStore((state) => state.setSelectedSymbol);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const equities = useEquities();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const universe = equities.data ?? [];
    return needle ? universe.filter((item) => `${item.symbol} ${item.name} ${item.region}`.toLowerCase().includes(needle)).slice(0, 6) : universe.slice(0, 5);
  }, [equities.data, query]);

  const go = (path: string, symbol?: string) => {
    if (symbol) setSelected(symbol);
    navigate(path);
    setOpen(false);
    setQuery('');
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="command-dialog" aria-describedby={undefined} data-testid="command-palette">
          <Dialog.Title className="sr-only">Search Beta-Stock</Dialog.Title>
          <div className="command-input-wrap">
            <Search size={19} />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search securities, markets, or actions..." aria-label="Search" />
            <span className="keycap">ESC</span>
            <Dialog.Close className="command-close" aria-label="Close search"><X size={18} /></Dialog.Close>
          </div>
          <div className="command-body">
            {!query && <div className="command-group">
              <div className="command-label">Navigate</div>
              <div className="command-grid">{pages.map((page) => <button key={page.path} onClick={() => go(page.path)}><page.icon size={16} /><span><strong>{page.label}</strong><small>{page.hint}</small></span></button>)}</div>
            </div>}
            <div className="command-group">
              <div className="command-label">{query ? `Matches for "${query}"` : 'In your orbit'}</div>
              <div className="command-results">
                {results.map((item, index) => <button key={`${item.region}-${item.symbol}`} onClick={() => go(`/trade/${item.symbol}`, item.symbol)} className={cn(index === 0 && query && 'first-match')}>
                  <SymbolAvatar symbol={item.symbol} color={item.color} />
                  <span className="command-security"><strong>{item.symbol}</strong><small>{item.name}</small></span>
                  <MarketTag region={item.region} />
                  <span className="command-price">{item.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </button>)}
                {!results.length && <div className="command-empty">No instruments found. Try a symbol or company name.</div>}
              </div>
            </div>
          </div>
          <footer className="command-footer"><span><span className="keycap">Enter</span> open</span><span><span className="keycap">Ctrl K</span> toggle</span><span>All quotes are simulated</span></footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
