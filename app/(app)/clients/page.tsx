import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../lib/auth/actor';
import { authorize } from '../../../lib/auth/authorize';
import { roleHasCapability } from '../../../lib/auth/capabilities';
import {
  APPROVAL_STATES,
  canReadDirectory,
  canUseAssignment,
  directoryHref,
  directoryIndicatorHref,
  directorySearchPlaceholderKey,
  parseDirectoryQuery,
  type ApprovalState,
} from '../../../lib/client-directory/query';
import { loadClientDirectory } from '../../../lib/client-directory/service';
import {
  SUBSCRIPTION_STATUSES,
  staffSubscriptionStatusLabelKey,
} from '../../../lib/client-access/portal-projection';
import { createSessionClient } from '../../../lib/supabase/server';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages, type MessageKey } from '../../../lib/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Bidi } from '../../../components/ui/Bidi';
import { Button } from '../../../components/ui/Button';
import { EmptyState, NoResults } from '../../../components/ui/States';
import { formatCount } from '../../../components/client-portal/format';
import styles from '../../../components/client-portal/client-portal.module.css';
import { DirectoryWorkspaceSelector } from './DirectoryWorkspaceSelector';

const approvalLabel: Record<ApprovalState, MessageKey> = {
  'pending-approval': 'registrationApproval.pending',
  approved: 'registrationApproval.approved',
  rejected: 'registrationApproval.rejected',
};

type SearchValue = string | string[] | undefined;

/**
 * F22 US5 staff client directory. Search: F11 name/email/phone/username. Filters:
 * F11 approval state and F13 subscription status (S57-PO-12 labels; the
 * Refunded option matches full refunds only). Username search follows existing
 * row visibility; code search/output and trainer assignment filtering/output
 * remain behind the Platform Owner / same-workspace Workspace Owner wall.
 */
export default async function ClientDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: SearchValue;
    q?: SearchValue;
    approval?: SearchValue;
    subscription?: SearchValue;
    assignment?: SearchValue;
    expiry?: SearchValue;
    page?: SearchValue;
  }>;
}) {
  const actor = await requireActor();
  if (!actor.role || !roleHasCapability(actor.role, 'coaching_work'))
    notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const renderFailure = (isExpiring = false) => (
    <main className={styles.main}>
      <h1>{m['staff.clientDirectory.title']}</h1>
      <Alert tone="error" title={m['states.error.title']}>
        <p>
          {isExpiring
            ? m['staff.clientDirectory.expiring.loadError']
            : m['states.error.description']}
        </p>
      </Alert>
    </main>
  );

  const client = await createSessionClient();
  if (!client) return renderFailure();
  let workspaces: { id: string; name: string }[];
  try {
    const listed = await client
      .from('workspaces')
      .select('id,name')
      .order('name');
    if (listed.error || !listed.data) return renderFailure();
    workspaces = listed.data.filter((w) =>
      authorize(actor, 'coaching_work', w.id),
    );
  } catch {
    return renderFailure();
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

  const isExpiringFilter =
    query.subscriptionStatus === 'expiring' ||
    query.subscriptionStatus === 'expired' ||
    query.expiry === 'expiring' ||
    query.expiry === 'expired';

  const result = await loadClientDirectory(client, actor, workspaceId, query);
  if (result.status === 'not_permitted' || result.status === 'invalid_input')
    notFound();
  if (result.status !== 'ok') return renderFailure(isExpiringFilter);

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
              <DirectoryWorkspaceSelector
                workspaceId={workspaceId}
                workspaces={workspaces}
                query={query}
              />
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
              placeholder={m[directorySearchPlaceholderKey(actor, workspaceId)]}
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
          <div className={styles.control}>
            <label htmlFor="directory-subscription">
              {m['client.portal.subscriptionStatus']}
            </label>
            <select
              id="directory-subscription"
              name="subscription"
              defaultValue={
                query.subscriptionStatus === 'expiring'
                  ? 'expiring'
                  : (query.expiry ?? query.subscriptionStatus ?? '')
              }
            >
              <option value="">{m['client.portal.subscriptionStatus']}</option>
              <option value="expiring">
                {m['staff.clientDirectory.expiring']}
              </option>
              {SUBSCRIPTION_STATUSES.map((status) => {
                // The Refunded filter matches full refunds only (S57-PO-12).
                const key = staffSubscriptionStatusLabelKey({
                  status,
                  refundScope: 'full',
                });
                return key ? (
                  <option key={status} value={status}>
                    {m[key]}
                  </option>
                ) : null;
              })}
            </select>
          </div>
          {canUseAssignment(actor, workspaceId) && (
            <div className={styles.control}>
              <label htmlFor="directory-assignment">
                {m['staff.clientDirectory.assignment']}
              </label>
              <select
                id="directory-assignment"
                name="assignment"
                defaultValue={query.assignment ?? ''}
              >
                <option value="">
                  {m['staff.clientDirectory.assignment.all']}
                </option>
                <option value="assigned">
                  {m['staff.clientDirectory.assignment.assigned']}
                </option>
                <option value="unassigned">
                  {m['staff.clientDirectory.assignment.unassigned']}
                </option>
              </select>
            </div>
          )}
          <Button type="submit">{m['catalog.searchSubmit']}</Button>
        </fieldset>
      </form>

      {result.rows.length === 0 ? (
        <NoResults
          title={
            isExpiringFilter
              ? m['staff.clientDirectory.expiring.empty']
              : m['states.noResults.title']
          }
          description={
            isExpiringFilter ? undefined : m['states.noResults.description']
          }
        />
      ) : (
        <ul className={styles.list} data-testid="client-directory-results">
          {result.rows.map((row) => (
            <li key={row.clientId} className={styles.panel}>
              <Link className={styles.link} href={`/clients/${row.clientId}`}>
                <Bidi>{row.name}</Bidi>
              </Link>
              {row.clientCode && (
                <p className={styles.meta} data-testid="directory-client-code">
                  {m['staff.clientDirectory.clientCode']}:{' '}
                  <Bidi>{row.clientCode}</Bidi>
                </p>
              )}
              <p className={styles.meta}>
                {m['registrationApproval.clientStatus']}:{' '}
                {m[approvalLabel[row.approvalState]]}
              </p>
              {row.expiryBucket === 'expiring' && (
                <p
                  className={styles.expiryBadge}
                  data-testid="directory-expiring-badge"
                >
                  <span>{m['staff.clientDirectory.expiring']}</span>
                </p>
              )}
              {row.expiryBucket === 'expired' && (
                <p
                  className={styles.expiryBadge}
                  data-testid="directory-expired-badge"
                >
                  <span>
                    {m['staff.clientDirectory.subscriptionStatus.expired']}
                  </span>
                </p>
              )}
              {row.subscriptionStatus &&
                row.subscriptionStatus !== 'expiring' &&
                row.expiryBucket !== 'expired' &&
                (() => {
                  const key = staffSubscriptionStatusLabelKey({
                    status: row.subscriptionStatus as Exclude<
                      typeof row.subscriptionStatus,
                      'expiring'
                    >,
                    refundScope: row.refundScope ?? undefined,
                  });
                  return key ? (
                    <p
                      className={styles.meta}
                      data-testid="directory-subscription-status"
                    >
                      {m['client.portal.subscriptionStatus']}: {m[key]}
                    </p>
                  ) : null;
                })()}
              {row.plansWaitingForDelivery > 0 && (
                <p
                  className={styles.indicator}
                  data-testid="indicator-plans-waiting"
                >
                  {/* T037: indicator links to owning F19 surface */}
                  <Link
                    className={styles.link}
                    href={directoryIndicatorHref(
                      'plansWaitingForDelivery',
                      row.clientId,
                    )}
                  >
                    {m['staff.clientDirectory.plansWaitingForDelivery']}:{' '}
                    <Bidi>
                      {formatCount(row.plansWaitingForDelivery, locale)}
                    </Bidi>
                  </Link>
                </p>
              )}
              {row.pendingFoodReplacements > 0 && (
                <p
                  className={styles.indicator}
                  data-testid="indicator-pending-food-replacements"
                >
                  {/* T037: the staff progress timeline shows the client's replacement requests. */}
                  <Link
                    className={styles.link}
                    href={directoryIndicatorHref(
                      'pendingFoodReplacements',
                      row.clientId,
                    )}
                  >
                    {m['staff.clientDirectory.pendingFoodReplacements']}:{' '}
                    <Bidi>
                      {formatCount(row.pendingFoodReplacements, locale)}
                    </Bidi>
                  </Link>
                </p>
              )}
              {row.newCheckIns !== undefined && row.newCheckIns > 0 && (
                <p
                  className={styles.indicator}
                  data-testid="indicator-new-check-ins"
                >
                  {/* T036 & T037: new check-ins indicator links to F15 progress timeline */}
                  <Link
                    className={styles.link}
                    href={directoryIndicatorHref('newCheckIns', row.clientId)}
                  >
                    {m['staff.clientDirectory.newCheckIns']}:{' '}
                    <Bidi>{formatCount(row.newCheckIns, locale)}</Bidi>
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {(query.page > 1 || result.hasMore) && (
        <nav
          className={styles.pager}
          aria-label={m['staff.clientDirectory.paginationLabel']}
        >
          {query.page > 1 && (
            <Link
              className={styles.link}
              href={directoryHref(workspaceId, query, query.page - 1)}
            >
              {m['staff.clientDirectory.previousPage']}
            </Link>
          )}
          {result.hasMore && (
            <Link
              className={styles.link}
              href={directoryHref(workspaceId, query, query.page + 1)}
            >
              {m['staff.clientDirectory.nextPage']}
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
