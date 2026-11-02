'use client';

import { useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Locale } from '../../lib/design/preferences';
import type { FormsStaffRole } from '../../lib/forms/staff-contracts';
import { createPersistedFormsStaffAdapter } from '../../lib/forms/persisted-staff-adapter';
import { FormsStaffConsole } from './FormsStaffConsole';

export function ProductionFormsConsole({
  locale,
  role,
  workspaceId,
  workspaces,
  supabaseUrl,
  supabaseAnonKey,
}: {
  locale: Locale;
  role: FormsStaffRole;
  workspaceId: string;
  workspaces: readonly { id: string; name: string }[];
  supabaseUrl: string;
  supabaseAnonKey: string;
}) {
  const { adapter, brandSource } = useMemo(() => {
    const client = createBrowserClient(supabaseUrl, supabaseAnonKey);
    return {
      adapter: createPersistedFormsStaffAdapter(client, workspaceId),
      brandSource: {
        async resolvePublishedColor(id: string) {
          const { data, error } = await client.rpc('branding_current_read', {
            workspace_id: id,
          });
          if (error || !data || typeof data !== 'object' || !('color' in data))
            return null;
          return typeof data.color === 'string' ? data.color : null;
        },
      },
    };
  }, [supabaseAnonKey, supabaseUrl, workspaceId]);

  return (
    <FormsStaffConsole
      locale={locale}
      adapter={adapter}
      brandSource={brandSource}
      workspaceId={workspaceId}
      workspaces={workspaces}
      actorRole={role}
      demo={false}
    />
  );
}
