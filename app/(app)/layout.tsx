import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { requireActor } from '../../lib/auth/actor';
import { createSessionClient } from '../../lib/supabase/server';
import { AppShell } from '../../components/shell/AppShell';
import { BrandScope } from '../../components/ui/BrandScope';
import { LOCALE_COOKIE, parseLocale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import styles from './staff-brand-scope.module.css';

export default async function StaffLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await requireActor();
  const navigationRole =
    actor.role === 'trainer'
      ? 'trainer'
      : actor.role === null
        ? 'client'
        : null;
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const workspaceId =
    actor.activeWorkspaceIds.length === 1 ? actor.activeWorkspaceIds[0]! : null;
  let color: string | undefined;
  if (workspaceId) {
    const client = await createSessionClient();
    if (client) {
      const { data, error } = await client.rpc('branding_current_read', {
        workspace_id: workspaceId,
      });
      if (
        !error &&
        data &&
        typeof data === 'object' &&
        'color' in data &&
        typeof data.color === 'string'
      ) {
        color = data.color;
      }
    }
  }
  return (
    <BrandScope
      className={styles.scope}
      color={color}
      data-staff-brand-workspace={color ? workspaceId : undefined}
    >
      {navigationRole ? (
        <AppShell
          role={navigationRole}
          messages={getMessages(locale)}
          workspaceId={workspaceId ?? undefined}
          contentAs="div"
        >
          {children}
        </AppShell>
      ) : (
        children
      )}
    </BrandScope>
  );
}
