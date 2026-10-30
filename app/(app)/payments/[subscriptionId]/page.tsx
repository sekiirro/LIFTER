import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../../lib/auth/actor';
import { roleHasCapability } from '../../../../lib/auth/capabilities';
import { readSubscriptionPaymentStatus } from '../../../../lib/registration-approval/read';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { PaymentHistory } from '../../../../components/registration-approval/PaymentHistory';
import { subscriptionCommissionAction } from '../../registration-approvals/actions';
import styles from '../../packages/packages.module.css';

export default async function PaymentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{
    workspace?: string | string[];
    client?: string | string[];
  }>;
}) {
  const actor = await requireActor();
  if (!actor.role || !roleHasCapability(actor.role, 'record_payment'))
    notFound();
  const { subscriptionId } = await params;
  const query = await searchParams;
  if (typeof query.workspace !== 'string' || typeof query.client !== 'string')
    notFound();
  const result = await readSubscriptionPaymentStatus({
    workspaceId: query.workspace,
    clientId: query.client,
    subscriptionId,
  });
  const store = await cookies();
  const m = getMessages(parseLocale(store.get(LOCALE_COOKIE)?.value));
  if (result.status !== 'ok')
    return (
      <main className={styles.main}>
        <h1>{m['registrationApproval.history']}</h1>
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
  const commission =
    actor.role === 'platform_owner' || actor.role === 'workspace_owner'
      ? await subscriptionCommissionAction({
          workspaceId: query.workspace,
          subscriptionId,
        })
      : null;
  const commissionData = commission as {
    status?: string;
    events?: never[];
  } | null;
  const commissionEvents =
    commissionData?.status === 'ok' && Array.isArray(commissionData.events)
      ? commissionData.events
      : [];
  return (
    <main className={styles.main}>
      <h1>{m['registrationApproval.history']}</h1>
      <PaymentHistory
        obligations={(result as { obligations: never[] }).obligations}
        workspaceId={query.workspace}
        clientId={query.client}
        subscriptionId={subscriptionId}
        role={actor.role}
        commissionEvents={commissionEvents}
        messages={m}
      />
    </main>
  );
}
