import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell, Bot, BriefcaseBusiness, ChartNoAxesCombined, Check, ChevronDown,
  CircleHelp, FileClock, Gauge, Menu, Moon, Search, Settings2, Sun, TrendingUp,
} from 'lucide-react';
import { useAppStore, type GainConvention } from '../app/store';
import { useBootstrap, useHealth } from '../app/api';
import { useLocation } from '../app/router';
import { NavigationLink } from './NavigationLink';
import { CommandPalette } from './CommandPalette';
import { cn } from './UI';

const navItems = [
  { path: '/', label: 'Overview', icon: Gauge, end: true },
  { path: '/markets', label: 'Markets', icon: ChartNoAxesCombined },
  { path: '/trade/NVDA', label: 'Trade', icon: TrendingUp },
  { path: '/portfolio', label: 'Portfolio', icon: BriefcaseBusiness },
  { path: '/orders', label: 'Orders', icon: FileClock },
  { path: '/ai-lab', label: 'AI Lab', icon: Bot },
];

function BrandMark() {
  return (
    <NavigationLink to="/" end className="brand-lockup" aria-label="Beta-Stock home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32"><path d="M6 22.5V9.7c0-2 1.6-3.7 3.7-3.7h5.6c3.9 0 6.3 1.8 6.3 4.8 0 1.7-.8 3-2.2 3.9 2.4.7 3.7 2.4 3.7 4.9 0 4-3 6.4-7.9 6.4H9.6A3.6 3.6 0 0 1 6 22.5Zm6-10.2h3.3c1.2 0 1.9-.5 1.9-1.4s-.7-1.4-1.9-1.4H12v2.8Zm0 9.9h3.8c1.7 0 2.7-.8 2.7-2.2 0-1.3-1-2.1-2.7-2.1H12v4.3Z" /></svg>
      </span>
      <span className="brand-word">Beta<span>-Stock</span></span>
    </NavigationLink>
  );
}

function ExchangeClocks() {
  const bootstrap = useBootstrap();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const clocks = useMemo(() => [
    { label: 'New York', region: 'US' as const, zone: 'America/New_York' },
    { label: 'Hong Kong', region: 'HK' as const, zone: 'Asia/Hong_Kong' },
    { label: 'Shanghai', region: 'CN' as const, zone: 'Asia/Shanghai' },
  ].map((clock) => {
    const session = bootstrap.data?.markets.find((market) => (market.region ?? market.market) === clock.region)?.session;
    return { ...clock, session, open: session ? session.phase !== 'CLOSED' : false, time: new Intl.DateTimeFormat('en-GB', { timeZone: clock.zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now) };
  }), [now, bootstrap.data]);
  return <div className="exchange-clocks">{clocks.map((clock) => <div key={clock.label} title={clock.session ? clock.session.phase.replaceAll('_', ' ') : 'Session state unavailable'}><span className={cn('session-dot', clock.open && 'open', !clock.session && 'unknown')} /> <span>{clock.label}</span><strong>{clock.time}</strong></div>)}</div>;
}

function NavTip({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content side="right" sideOffset={10} className="tooltip-content">{label}<Tooltip.Arrow className="tooltip-arrow" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}

function SettingsMenu() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const gain = useAppStore((state) => state.gainConvention);
  const setGain = useAppStore((state) => state.setGainConvention);
  const gainOptions: { value: GainConvention; label: string; detail: string }[] = [
    { value: 'green-up', label: 'Green is gain', detail: 'US / HK convention' },
    { value: 'red-up', label: 'Red is gain', detail: 'Mainland convention' },
  ];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild><button className="top-icon" aria-label="Appearance and market preferences"><Settings2 size={17} /></button></DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown-panel settings-panel" align="end" sideOffset={9}>
          <DropdownMenu.Label>Appearance</DropdownMenu.Label>
          <div className="theme-switch">
            <button onClick={() => setTheme('dark')} className={cn(theme === 'dark' && 'active')}><Moon size={14} /> Dark</button>
            <button onClick={() => setTheme('light')} className={cn(theme === 'light' && 'active')}><Sun size={14} /> Light</button>
          </div>
          <DropdownMenu.Separator />
          <DropdownMenu.Label>Gain convention</DropdownMenu.Label>
          {gainOptions.map((option) => <DropdownMenu.Item className="settings-item" key={option.value} onSelect={() => setGain(option.value)}><span className={cn('convention-dot', option.value === 'red-up' && 'red')} /><span><strong>{option.label}</strong><small>{option.detail}</small></span>{gain === option.value && <Check size={15} />}</DropdownMenu.Item>)}
          <DropdownMenu.Arrow className="dropdown-arrow" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const theme = useAppStore((state) => state.theme);
  const setCommandOpen = useAppStore((state) => state.setCommandOpen);
  const health = useHealth();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand"><BrandMark /><span className="sim-badge"><span /> SIMULATED</span></div>
        <button className="mobile-menu" aria-label="Open navigation"><Menu size={20} /></button>
        <button className="global-search" data-testid="global-search" onClick={() => setCommandOpen(true)}><Search size={17} /><span>Search markets, symbols, actions...</span><kbd>Ctrl K</kbd></button>
        <ExchangeClocks />
        <div className="top-actions">
          <button className="top-icon help-button" aria-label="Help"><CircleHelp size={17} /></button>
          <button className="top-icon notification-button" aria-label="Notifications"><Bell size={17} /><span className="notification-dot" /></button>
          <SettingsMenu />
          <button className="account-chip" aria-label="Demo simulator account"><span className="account-avatar">BS</span><span><strong>Demo account</strong><small>Paper simulator</small></span><ChevronDown size={14} /></button>
        </div>
      </header>

      <aside className="left-rail" aria-label="Primary navigation">
        <nav>{navItems.map((item) => <NavTip label={item.label} key={item.path}><NavigationLink to={item.path} end={item.end} className={({ isActive }) => cn('rail-link', isActive && 'active')} aria-label={item.label}><item.icon size={20} strokeWidth={1.8} /><span>{item.label}</span></NavigationLink></NavTip>)}</nav>
        <div className="rail-footer"><span className={cn('connection-indicator', health.isError && 'offline')} title={health.isSuccess ? health.data.service : health.isError ? 'Local API unavailable' : 'Checking local API'} data-testid="service-status"><i />{health.isSuccess ? 'API' : health.isError ? 'OFFLINE' : 'CHECK'}</span></div>
      </aside>

      <main className="app-main">
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname} className="route-stage" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.map((item) => <NavigationLink to={item.path} key={item.path} end={item.end} className={({ isActive }) => cn(isActive && 'active')}><item.icon size={20} /><span>{item.label}</span></NavigationLink>)}</nav>
      <CommandPalette />
    </div>
  );
}
