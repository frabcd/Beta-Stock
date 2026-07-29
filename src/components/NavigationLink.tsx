import { type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { navigate, useLocation } from '../app/router';

type ActiveState = { isActive: boolean };
type NavigationLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'href'> & {
  to: string;
  end?: boolean;
  className?: string | ((state: ActiveState) => string);
};

export function NavigationLink({ to, end = false, className, onClick, ...props }: NavigationLinkProps) {
  const { pathname } = useLocation();
  const targetPath = new URL(to, window.location.origin).pathname;
  const tradeSection = targetPath.startsWith('/trade/');
  const isActive = end
    ? pathname === targetPath
    : tradeSection
      ? pathname.startsWith('/trade/')
      : pathname === targetPath || pathname.startsWith(`${targetPath}/`);
  const resolvedClassName = typeof className === 'function' ? className({ isActive }) : className;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  };

  return <a href={to} className={resolvedClassName} aria-current={isActive ? 'page' : undefined} onClick={handleClick} {...props} />;
}
