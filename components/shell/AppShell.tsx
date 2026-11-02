import type { ReactNode } from 'react';
import {
  getNavigation,
  type NavItem,
  type NavKey,
  type Role,
} from '../../lib/design/navigation';
import type { Messages } from '../../lib/i18n';
import { BottomBar } from './BottomBar';
import { NavRail } from './NavRail';
import styles from './AppShell.module.css';

export type ShellNavigationProps = {
  items: readonly NavItem[];
  activeKey?: NavKey;
  hrefFor?: (key: NavKey) => string;
  messages: Messages;
  className?: string;
};
export type AppShellProps = Omit<
  ShellNavigationProps,
  'items' | 'className'
> & { role: Role; children: ReactNode; contentAs?: 'main' | 'div' };

export function AppShell({
  role,
  activeKey,
  hrefFor,
  messages,
  children,
  contentAs: Content = 'main',
}: AppShellProps) {
  const navigation = getNavigation(role);
  if (navigation.status === 'needs-decision')
    return <Content>{children}</Content>;
  const props = { items: navigation.items, activeKey, hrefFor, messages };
  return (
    <div className={styles.shell} data-shell="">
      <NavRail {...props} className={styles.rail} />
      <Content className={styles.content}>{children}</Content>
      <BottomBar {...props} className={styles.bottom} />
    </div>
  );
}
