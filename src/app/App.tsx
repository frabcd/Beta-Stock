import { lazy, Suspense, useEffect } from 'react';
import { Shell } from '../components/Shell';
import { LoadingState } from '../components/UI';
import { useLocation, useNavigate } from './router';

const Overview = lazy(() => import('../features/overview/Overview').then((module) => ({ default: module.Overview })));
const Markets = lazy(() => import('../features/markets/Markets').then((module) => ({ default: module.Markets })));
const TradeWorkspace = lazy(() => import('../features/trade/TradeWorkspace').then((module) => ({ default: module.TradeWorkspace })));
const Portfolio = lazy(() => import('../features/portfolio/Portfolio').then((module) => ({ default: module.Portfolio })));
const OrdersJournal = lazy(() => import('../features/orders/OrdersJournal').then((module) => ({ default: module.OrdersJournal })));
const AiLab = lazy(() => import('../features/ai/AiLab').then((module) => ({ default: module.AiLab })));

export function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const isTradeRoute = /^\/trade\/[^/]+$/.test(normalizedPath);
  const knownPath = isTradeRoute || ['/', '/markets', '/portfolio', '/orders', '/ai-lab'].includes(normalizedPath);

  useEffect(() => {
    if (!knownPath) navigate('/', { replace: true });
  }, [knownPath, navigate]);

  const route = normalizedPath === '/markets' ? <Markets />
    : isTradeRoute ? <TradeWorkspace />
      : normalizedPath === '/portfolio' ? <Portfolio />
        : normalizedPath === '/orders' ? <OrdersJournal />
          : normalizedPath === '/ai-lab' ? <AiLab />
            : <Overview />;

  return (
    <Shell>
      <Suspense fallback={<div className="page" data-testid="route-loading"><LoadingState rows={6} /></div>}>
        {route}
      </Suspense>
    </Shell>
  );
}
