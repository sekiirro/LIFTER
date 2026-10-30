import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../lib/auth/actor';
import { roleHasCapability } from '../../../lib/auth/capabilities';
import { createSessionClient } from '../../../lib/supabase/server';
import { readRegistrationApprovalQueue } from '../../../lib/registration-approval/read';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { Alert } from '../../../components/ui/Alert';
import { EmptyState } from '../../../components/ui/States';
import { ApprovalQueue } from '../../../components/registration-approval/ApprovalQueue';
import styles from '../packages/packages.module.css';

export default async function RegistrationApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const actor = await requireActor();
  if (
    !actor.role ||
    !roleHasCapability(actor.role, 'approve_registration') ||
    (actor.role !== 'platform_owner' && actor.role !== 'workspace_owner')
  )
    notFound();
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const workspaces = await loadWorkspaces(
    actor.role === 'platform_owner' ? undefined : actor.activeWorkspaceIds,
  );
  const main = (children: React.ReactNode) => (
    <main className={styles.main}>
      <h1>{m['registrationApproval.title']}</h1>
      {children}
    </main>
  );
  if (!workspaces)
    return main(
      <Alert tone="error" title={m['registrationApproval.unavailable']} />,
    );
  if (!workspaces.length)
    return main(<EmptyState title={m['registrationApproval.noWorkspace']} />);
  const requested = (await searchParams).workspace;
  const workspaceId = requested ?? workspaces[0]!.id;
  if (
    typeof workspaceId !== 'string' ||
    !workspaces.some((workspace) => workspace.id === workspaceId)
  )
    notFound();
  const result = await readRegistrationApprovalQueue({ workspaceId });
  if (result.status !== 'ok')
    return main(
      <Alert
        tone="error"
        title={
          m[
            result.status === 'not_permitted'
              ? 'registrationApproval.notPermitted'
              : 'registrationApproval.unavailable'
          ]
        }
      />,
    );
  const items = (result as { items?: never[] }).items ?? [];
  return main(
    <>
      <form method="get">
        <label htmlFor="workspace">{m['registrationApproval.workspace']}</label>
        <select id="workspace" name="workspace" defaultValue={workspaceId}>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </form>
      <p>{m['registrationApproval.intro']}</p>
      <ApprovalQueue items={items} workspaceId={workspaceId} messages={m} />
    </>,
  );
}

async function loadWorkspaces(ids?: readonly string[]) {
  try {
    const client = await createSessionClient();
    if (!client) return null;
    const query = client.from('workspaces').select('id,name').order('name');
    const result = ids ? await query.in('id', [...ids]) : await query;
    return result.error ? null : result.data;
  } catch {
    return null;
  }
}
