/**
 * F22 staff client directory query contract (FR-010, FR-011; SC-008).
 *
 * Search covers existing F11 identity fields (name, email, phone); filters
 * use existing F11 approval state and F13 projected subscription status. No
 * status or assignment state is introduced here. The database function
 * `staff_client_directory` repeats every check at the second wall.
 */
import { authorize, type Actor } from '../auth/authorize';
import {
  SUBSCRIPTION_STATUSES,
  isUuid,
} from '../client-access/portal-projection';
import type { SubscriptionStatus } from '../client-access/portal-projection';

export const APPROVAL_STATES = [
  'pending-approval',
  'approved',
  'rejected',
] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const DIRECTORY_PAGE_SIZE = 50;
export const DIRECTORY_SEARCH_MAX = 100;
export const DIRECTORY_MAX_PAGE = 200;

export type DirectoryQuery = {
  search: string | null;
  approvalState: ApprovalState | null;
  subscriptionStatus: SubscriptionStatus | null;
  page: number;
};

export type DirectoryRow = {
  clientId: string;
  name: string;
  approvalState: ApprovalState;
  subscriptionStatus: SubscriptionStatus | null;
  plansWaitingForDelivery: number;
};

export type DirectoryResult =
  | { status: 'ok'; rows: DirectoryRow[]; hasMore: boolean }
  | { status: 'invalid_input' }
  | { status: 'not_permitted' }
  | { status: 'unavailable' };

type SearchValue = string | string[] | undefined;

function single(value: SearchValue): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : null;
}

/** Parse URL search params; any malformed value yields `null` (invalid). */
export function parseDirectoryQuery(params: {
  q?: SearchValue;
  approval?: SearchValue;
  subscription?: SearchValue;
  page?: SearchValue;
}): DirectoryQuery | null {
  const q = single(params.q);
  const approval = single(params.approval);
  const subscription = single(params.subscription);
  const page = single(params.page);
  if (q === null || approval === null || subscription === null || page === null)
    return null;
  const search = q?.trim() ? q.trim() : null;
  if (search !== null && [...search].length > DIRECTORY_SEARCH_MAX) return null;
  let approvalState: ApprovalState | null = null;
  if (approval !== undefined && approval !== '') {
    if (!(APPROVAL_STATES as readonly string[]).includes(approval)) return null;
    approvalState = approval as ApprovalState;
  }
  let subscriptionStatus: SubscriptionStatus | null = null;
  if (subscription !== undefined && subscription !== '') {
    if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(subscription))
      return null;
    subscriptionStatus = subscription as SubscriptionStatus;
  }
  let pageNumber = 1;
  if (page !== undefined && page !== '') {
    if (!/^[1-9][0-9]{0,3}$/u.test(page)) return null;
    pageNumber = Number(page);
    if (pageNumber > DIRECTORY_MAX_PAGE) return null;
  }
  return { search, approvalState, subscriptionStatus, page: pageNumber };
}

/**
 * App-layer workspace wall: the same `coaching_work` capability and active
 * membership (or verified Platform Owner) that guards F20 Client Details.
 */
export function canReadDirectory(actor: Actor, workspaceId: unknown): boolean {
  return isUuid(workspaceId) && authorize(actor, 'coaching_work', workspaceId);
}

export function directoryRpcArgs(workspaceId: string, query: DirectoryQuery) {
  return {
    p_workspace_id: workspaceId,
    p_search: query.search,
    p_approval_state: query.approvalState,
    p_subscription_status: query.subscriptionStatus,
    p_limit: DIRECTORY_PAGE_SIZE,
    p_offset: (query.page - 1) * DIRECTORY_PAGE_SIZE,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseRow(value: unknown): DirectoryRow | null {
  if (!isRecord(value)) return null;
  const {
    client_id,
    name,
    approval_state,
    subscription_status,
    plans_waiting_for_delivery,
  } = value;
  if (
    Object.keys(value).sort().join(',') !==
      'approval_state,client_id,name,plans_waiting_for_delivery,subscription_status' ||
    !isUuid(client_id) ||
    typeof name !== 'string' ||
    !(APPROVAL_STATES as readonly unknown[]).includes(approval_state) ||
    !(
      subscription_status === null ||
      (SUBSCRIPTION_STATUSES as readonly unknown[]).includes(
        subscription_status,
      )
    ) ||
    typeof plans_waiting_for_delivery !== 'number' ||
    !Number.isSafeInteger(plans_waiting_for_delivery) ||
    plans_waiting_for_delivery < 0
  )
    return null;
  return {
    clientId: client_id,
    name,
    approvalState: approval_state as ApprovalState,
    subscriptionStatus: subscription_status as SubscriptionStatus | null,
    plansWaitingForDelivery: plans_waiting_for_delivery,
  };
}

/** Map the RPC transport result to the closed directory result. */
export function parseDirectoryResult(
  data: unknown,
  error: unknown,
): DirectoryResult {
  if (error) {
    const code = isRecord(error) ? error.code : undefined;
    return code === '42501'
      ? { status: 'not_permitted' }
      : { status: 'unavailable' };
  }
  if (!isRecord(data)) return { status: 'unavailable' };
  if (data.status === 'invalid_input') return { status: 'invalid_input' };
  if (
    data.status !== 'ok' ||
    !Array.isArray(data.clients) ||
    typeof data.has_more !== 'boolean'
  )
    return { status: 'unavailable' };
  const rows: DirectoryRow[] = [];
  for (const item of data.clients) {
    const row = parseRow(item);
    if (!row) return { status: 'unavailable' };
    rows.push(row);
  }
  return { status: 'ok', rows, hasMore: data.has_more };
}

/** Directory href preserving the current query; values are URL-encoded. */
export function directoryHref(
  workspaceId: string,
  query: DirectoryQuery,
  page: number,
): string {
  const params = new URLSearchParams({ workspace: workspaceId });
  if (query.search) params.set('q', query.search);
  if (query.approvalState) params.set('approval', query.approvalState);
  if (query.subscriptionStatus)
    params.set('subscription', query.subscriptionStatus);
  if (page > 1) params.set('page', String(page));
  return `/clients?${params.toString()}`;
}
