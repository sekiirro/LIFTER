import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  getNavigation,
  type NavItem,
  type NavKey,
  type Role,
} from '../../lib/design/navigation';
import type { GlassFallback } from '../ui/glass/GlassSurface';
import type { Messages } from '../../lib/i18n';
import { ShellNavigation } from './ShellNavigation';
import styles from './AppShell.module.css';

const PlatformOwnerHeader = dynamic(
  () =>
    import('./PlatformOwnerHeader').then(
      (module) => module.PlatformOwnerHeader,
    ),
  { ssr: true },
);

export type ShellNavigationProps = {
  items: readonly NavItem[];
  activeKey?: NavKey;
  hrefFor?: (key: NavKey) => string;
  messages: Messages;
  className?: string;
  /** Dev/test hook: force the glass surface fallback variant. Defaults to auto. */
  fallback?: GlassFallback;
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
  fallback,
}: AppShellProps) {
  const navigation = getNavigation(role);
  if (role === 'platform_owner')
    return (
      <div className={styles.shell} data-shell="">
        <PlatformOwnerHeader messages={messages} />
        <Content className={styles.content}>{children}</Content>
      </div>
    );
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
        fallback={fallback}
        railClassName={styles.rail}
        bottomClassName={styles.bottom}
      />
      <Content className={styles.content}>{children}</Content>
    </div>
  );
}
