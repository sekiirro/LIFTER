import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../lib/auth/actor';
import { roleHasCapability } from '../../../lib/auth/capabilities';
import { createSessionClient } from '../../../lib/supabase/server';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { ProductionFormsConsole } from '../../../components/forms/ProductionFormsConsole';

type Workspace = { id: string; name: string };

export default async function FormsStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const actor = await requireActor();
  if (!actor.role || !roleHasCapability(actor.role, 'author_forms')) notFound();

  const client = await createSessionClient();
  if (!client) notFound();
  let query = client.from('workspaces').select('id,name').order('name');
  if (actor.role !== 'platform_owner') {
    if (actor.activeWorkspaceIds.length === 0) notFound();
    query = query.in('id', actor.activeWorkspaceIds);
  }
  const { data, error } = await query;
  if (error || !data?.length) notFound();
  const workspaces = data as Workspace[];
  const requested = (await searchParams).workspace;
  const requestedId = Array.isArray(requested) ? '' : requested;
  const selected = workspaces.find((workspace) => workspace.id === requestedId);
  const workspace = selected ?? workspaces[0]!;
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!publicUrl || !anonKey) notFound();

  return (
    <ProductionFormsConsole
      key={workspace.id}
      locale={locale}
      role={
        actor.role === 'platform_owner'
          ? 'po'
          : actor.role === 'workspace_owner'
            ? 'wo'
            : 'trainer'
      }
      workspaceId={workspace.id}
      workspaces={workspaces}
      supabaseUrl={publicUrl}
      supabaseAnonKey={anonKey}
    />
  );
}
