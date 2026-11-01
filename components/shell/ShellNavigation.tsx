'use client';

import { usePathname } from 'next/navigation';
import type { NavKey, Role, NavItem } from '../../lib/design/navigation';
import type { Messages } from '../../lib/i18n';
import { BottomBar } from './BottomBar';
import { NavRail } from './NavRail';

type ShellNavigationProps = {
  role: Role;
  items: readonly NavItem[];
  activeKey?: NavKey;
  messages: Messages;
  workspaceId?: string;
  railClassName?: string;
  bottomClassName?: string;
};

export function getActiveNavigationKey(
  pathname: string | null,
): NavKey | undefined {
  if (pathname === '/' || pathname === '/showcase/shell') return 'home';
  if (
    pathname === '/registration-links' ||
    pathname?.startsWith('/registration-links/')
  )
    return 'clients';
  return undefined;
}

export function ShellNavigation({
  role,
  items,
  activeKey: requestedActiveKey,
  messages,
  workspaceId,
  railClassName,
  bottomClassName,
}: ShellNavigationProps) {
  const pathname = usePathname();
  const activeKey = requestedActiveKey ?? getActiveNavigationKey(pathname);
  const hrefFor = (key: NavKey) => {
    if (pathname?.startsWith('/showcase')) return `?role=${role}#${key}`;
    if (key === 'home') return '/';
    if (key === 'clients' && role === 'trainer' && workspaceId)
      return `/registration-links?workspace=${encodeURIComponent(workspaceId)}`;
    return `/#${key}`;
  };
  const props = { items, activeKey, hrefFor, messages };
  return (
    <>
      <NavRail {...props} className={railClassName} />
      <BottomBar {...props} className={bottomClassName} />
    </>
  );
}
