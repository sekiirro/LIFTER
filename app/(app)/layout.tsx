import type { ReactNode } from 'react';
import { requireActor } from '../../lib/auth/actor';
import { createSessionClient } from '../../lib/supabase/server';
import { BrandScope } from '../../components/ui/BrandScope';
import styles from './staff-brand-scope.module.css';

export default async function StaffLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await requireActor();
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
      {children}
    </BrandScope>
  );
}
