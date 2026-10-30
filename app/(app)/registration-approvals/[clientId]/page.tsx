import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../../lib/auth/actor';
import { roleHasCapability } from '../../../../lib/auth/capabilities';
import { createSessionClient } from '../../../../lib/supabase/server';
import { readRegistrationApprovalReview } from '../../../../lib/registration-approval/read';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { ApprovalReview } from '../../../../components/registration-approval/ApprovalReview';
import styles from '../../packages/packages.module.css';

export default async function RegistrationApprovalReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const actor = await requireActor();
  if (
    !actor.role ||
    !roleHasCapability(actor.role, 'approve_registration') ||
    (actor.role !== 'platform_owner' && actor.role !== 'workspace_owner')
  )
    notFound();
  const { clientId } = await params;
  const workspace = (await searchParams).workspace;
  if (typeof workspace !== 'string') notFound();
  const store = await cookies();
  const m = getMessages(parseLocale(store.get(LOCALE_COOKIE)?.value));
  const result = await readRegistrationApprovalReview({
    workspaceId: workspace,
    clientId,
  });
  if (result.status !== 'ok')
    return (
      <main className={styles.main}>
        <h1>{m['registrationApproval.review']}</h1>
        <Alert
          tone="error"
          title={
            m[
              result.status === 'not_permitted'
                ? 'registrationApproval.notPermitted'
                : 'registrationApproval.unavailable'
            ]
          }
        />
      </main>
    );
  const data = await loadWorkspaces(
    actor.role === 'platform_owner' ? undefined : actor.activeWorkspaceIds,
  );
  if (!data || !data.some((item) => item.id === workspace)) notFound();
  return (
    <main className={styles.main}>
      <h1>{m['registrationApproval.review']}</h1>
      <ApprovalReview
        item={(result as { item: never }).item}
        workspaceId={workspace}
        role={actor.role}
        messages={m}
      />
    </main>
  );
}

async function loadWorkspaces(ids?: readonly string[]) {
  try {
    const client = await createSessionClient();
    if (!client) return null;
    const query = client.from('workspaces').select('id').order('id');
    const result = ids ? await query.in('id', [...ids]) : await query;
    return result.error ? null : result.data;
  } catch {
    return null;
  }
}
