import { useCallback, useSyncExternalStore } from 'react';

const navigationEvent = 'beta-stock:navigation';

function currentPathname() {
  return window.location.pathname || '/';
}

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener(navigationEvent, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(navigationEvent, listener);
  };
}

export function useLocation() {
  const pathname = useSyncExternalStore(subscribe, currentPathname, () => '/');
  return { pathname };
}

export type NavigateOptions = { replace?: boolean };

export function navigate(to: string, options: NavigateOptions = {}) {
  const target = new URL(to, window.location.origin);
  if (target.origin !== window.location.origin) {
    window.location.assign(target.href);
    return;
  }
  const next = `${target.pathname}${target.search}${target.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history[options.replace ? 'replaceState' : 'pushState']({}, '', next);
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  window.dispatchEvent(new Event(navigationEvent));
}

export function useNavigate() {
  return useCallback((to: string, options?: NavigateOptions) => navigate(to, options), []);
}

export function useParams() {
  const { pathname } = useLocation();
  const match = /^\/trade\/([^/]+)\/?$/.exec(pathname);
  return { symbol: match ? decodeURIComponent(match[1]) : undefined };
}
