import type { ReactNode } from 'react';
import {
  getNavigation,
  type NavItem,
  type NavKey,
  type Role,
} from '../../lib/design/navigation';
import type { Messages } from '../../lib/i18n';
import { ShellNavigation } from './ShellNavigation';
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
  'items' | 'className' | 'hrefFor' | 'activeKey'
> & {
  role: Role;
  activeKey?: NavKey;
  children: ReactNode;
  contentAs?: 'main' | 'div';
  workspaceId?: string;
};

export function AppShell({
  role,
  activeKey: requestedActiveKey,
  messages,
  children,
  contentAs: Content = 'main',
  workspaceId,
}: AppShellProps) {
  const navigation = getNavigation(role);
  if (navigation.status === 'needs-decision')
    return <Content>{children}</Content>;
  return (
    <div className={styles.shell} data-shell="">
      <ShellNavigation
        role={role}
        items={navigation.items}
        activeKey={requestedActiveKey}
        messages={messages}
        workspaceId={workspaceId}
        railClassName={styles.rail}
        bottomClassName={styles.bottom}
      />
      <Content className={styles.content}>{children}</Content>
    </div>
  );
}
