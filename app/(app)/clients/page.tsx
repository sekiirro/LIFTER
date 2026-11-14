import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../lib/auth/actor';
import { authorize } from '../../../lib/auth/authorize';
import { roleHasCapability } from '../../../lib/auth/capabilities';
import {
  APPROVAL_STATES,
  canReadDirectory,
  directoryHref,
  parseDirectoryQuery,
  type ApprovalState,
} from '../../../lib/client-directory/query';
import { loadClientDirectory } from '../../../lib/client-directory/service';
import { createSessionClient } from '../../../lib/supabase/server';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages, type MessageKey } from '../../../lib/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Bidi } from '../../../components/ui/Bidi';
import { Button } from '../../../components/ui/Button';
import { EmptyState, NoResults } from '../../../components/ui/States';
import { formatCount } from '../../../components/client-portal/format';
import styles from '../../../components/client-portal/client-portal.module.css';

const approvalLabel: Record<ApprovalState, MessageKey> = {
  'pending-approval': 'registrationApproval.pending',
  approved: 'registrationApproval.approved',
  rejected: 'registrationApproval.rejected',
};

type SearchValue = string | string[] | undefined;

/**
 * F22 US5 staff client directory. Search: F11 name/email/phone. Filters:
 * F11 approval state in the UI; F13 subscription status is accepted by the
 * query contract but has no control until its labels are approved. Client
 * code search, responsible-trainer filter and the check-in / food
 * replacement indicators are BLOCKED on facts that do not exist on main.
 */
export default async function ClientDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: SearchValue;
    q?: SearchValue;
    approval?: SearchValue;
    subscription?: SearchValue;
    page?: SearchValue;
  }>;
}) {
  const actor = await requireActor();
  if (!actor.role || !roleHasCapability(actor.role, 'coaching_work'))
    notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const failure = (
    <main className={styles.main}>
      <h1>{m['staff.clientDirectory.title']}</h1>
      <Alert tone="error" title={m['states.error.title']}>
        <p>{m['states.error.description']}</p>
      </Alert>
    </main>
  );

  const client = await createSessionClient();
  if (!client) return failure;
  let workspaces: { id: string; name: string }[];
  try {
    const listed = await client
      .from('workspaces')
      .select('id,name')
      .order('name');
    if (listed.error || !listed.data) return failure;
    workspaces = listed.data.filter((w) =>
      authorize(actor, 'coaching_work', w.id),
    );
  } catch {
    return failure;
  }
  if (!workspaces.length)
    return (
      <main className={styles.main}>
        <h1>{m['staff.clientDirectory.title']}</h1>
        <EmptyState title={m['registration.noWorkspace']} />
      </main>
    );

  const params = await searchParams;
  const workspaceId =
    params.workspace === undefined ? workspaces[0]!.id : params.workspace;
  const query = parseDirectoryQuery(params);
  if (
    !query ||
    !canReadDirectory(actor, workspaceId) ||
    typeof workspaceId !== 'string' ||
    !workspaces.some((w) => w.id === workspaceId)
  )
    notFound();

  const result = await loadClientDirectory(client, actor, workspaceId, query);
  if (result.status === 'not_permitted' || result.status === 'invalid_input')
    notFound();
  if (result.status !== 'ok') return failure;

  return (
    <main className={styles.main}>
      <h1>{m['staff.clientDirectory.title']}</h1>
      <form method="get" role="search" className={styles.panel}>
        <div className={styles.form}>
          {workspaces.length > 1 ? (
            <div className={styles.control}>
              <label htmlFor="directory-workspace">
                {m['registration.workspace']}
              </label>
              <select
                id="directory-workspace"
                name="workspace"
                defaultValue={workspaceId}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="workspace" value={workspaceId} />
          )}
          <div className={styles.control}>
            <label htmlFor="directory-search">
              {m['staff.clientDirectory.search']}
            </label>
            <input
              id="directory-search"
              name="q"
              type="search"
              maxLength={100}
              defaultValue={query.search ?? ''}
            />
          </div>
        </div>
        <fieldset className={styles.fieldset}>
          <legend>{m['staff.clientDirectory.filters']}</legend>
          <div className={styles.control}>
            <label htmlFor="directory-approval">
              {m['registrationApproval.clientStatus']}
            </label>
            <select
              id="directory-approval"
              name="approval"
              defaultValue={query.approvalState ?? ''}
            >
              <option value="">{m['registrationApproval.clientStatus']}</option>
              {APPROVAL_STATES.map((state) => (
                <option key={state} value={state}>
                  {m[approvalLabel[state]]}
                </option>
              ))}
            </select>
          </div>
          {query.subscriptionStatus && (
            <input
              type="hidden"
              name="subscription"
              value={query.subscriptionStatus}
            />
          )}
          <Button type="submit">{m['catalog.searchSubmit']}</Button>
        </fieldset>
      </form>

      {result.rows.length === 0 ? (
        <NoResults
          title={m['states.noResults.title']}
          description={m['states.noResults.description']}
        />
      ) : (
        <ul className={styles.list} data-testid="client-directory-results">
          {result.rows.map((row) => (
            <li key={row.clientId} className={styles.panel}>
              <Link className={styles.link} href={`/clients/${row.clientId}`}>
                <Bidi>{row.name}</Bidi>
              </Link>
              <p className={styles.meta}>
                {m['registrationApproval.clientStatus']}:{' '}
                {m[approvalLabel[row.approvalState]]}
              </p>
              {row.plansWaitingForDelivery > 0 && (
                <p
                  className={styles.indicator}
                  data-testid="indicator-plans-waiting"
                >
                  {m['staff.clientDirectory.plansWaitingForDelivery']}:{' '}
                  <Bidi>
                    {formatCount(row.plansWaitingForDelivery, locale)}
                  </Bidi>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {(query.page > 1 || result.hasMore) && (
        <nav
          className={styles.pager}
          aria-label={m['staff.clientDirectory.title']}
        >
          {query.page > 1 && (
            <Link
              className={styles.link}
              href={directoryHref(workspaceId, query, query.page - 1)}
            >
              {m['button.secondary']}
            </Link>
          )}
          {result.hasMore && (
            <Link
              className={styles.link}
              href={directoryHref(workspaceId, query, query.page + 1)}
            >
              {m['button.primary']}
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
