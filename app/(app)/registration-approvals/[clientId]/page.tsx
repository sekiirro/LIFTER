import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../../lib/auth/actor';
import { roleHasCapability } from '../../../../lib/auth/capabilities';
import { createSessionClient } from '../../../../lib/supabase/server';
import {
  readRegistrationApprovalCorrection,
  readRegistrationApprovalReview,
} from '../../../../lib/registration-approval/read';
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
  if (
    (actor.role !== 'platform_owner' &&
      !actor.activeWorkspaceIds.includes(workspace)) ||
    !(await workspaceExists(workspace))
  )
    notFound();
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
  const correctionResult =
    actor.role === 'platform_owner'
      ? await readRegistrationApprovalCorrection({
          workspaceId: workspace,
          clientId,
        })
      : null;
  return (
    <main className={styles.main}>
      <h1>{m['registrationApproval.review']}</h1>
      <ApprovalReview
        item={(result as { item: never }).item}
        workspaceId={workspace}
        role={actor.role}
        messages={m}
        correctionContext={
          correctionResult?.status === 'ok' ? correctionResult : null
        }
      />
    </main>
  );
}

async function workspaceExists(id: string) {
  try {
    const client = await createSessionClient();
    if (!client) return false;
    const result = await client
      .from('workspaces')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    return !result.error && result.data?.id === id;
  } catch {
    return false;
  }
}
