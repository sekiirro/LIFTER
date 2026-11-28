/**
 * F22 staff client directory query contract (FR-010, FR-011; SC-008).
 *
 * Search covers existing F11 identity fields (name, email, phone, normalized
 * username); filters use existing F11 approval state and F13 projected subscription status. No
 * status is introduced here. The assignment filter and assignment state reuse
 * F11's existing wall (FR-027, S40-PO-10 item 5: the Workspace Owner of the
 * workspace and the Platform Owner, the predicate of `unassigned_clients`) and
 * are ignored for every other caller, Trainers included. The database function
 * `staff_client_directory` repeats every check at the second wall.
 */
import { authorize, type Actor } from '../auth/authorize';
import {
  REFUND_SCOPES,
  SUBSCRIPTION_STATUSES,
  isUuid,
} from '../client-access/portal-projection';
import type {
  RefundScope,
  SubscriptionStatus,
} from '../client-access/portal-projection';

export const APPROVAL_STATES = [
  'pending-approval',
  'approved',
  'rejected',
] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const ASSIGNMENT_FILTERS = ['assigned', 'unassigned'] as const;
export type AssignmentFilter = (typeof ASSIGNMENT_FILTERS)[number];

export const EXPIRY_FILTERS = ['expiring', 'expired'] as const;
export type ExpiryFilter = (typeof EXPIRY_FILTERS)[number];

export const DIRECTORY_PAGE_SIZE = 50;
export const DIRECTORY_SEARCH_MAX = 100;
export const DIRECTORY_MAX_PAGE = 200;

export type DirectoryQuery = {
  search: string | null;
  approvalState: ApprovalState | null;
  subscriptionStatus: SubscriptionStatus | 'expiring' | null;
  /** Honoured only for callers passing {@link canUseAssignment}; see there. */
  assignment: AssignmentFilter | null;
  expiry?: ExpiryFilter | null;
  page: number;
};

export type DirectoryRow = {
  clientId: string;
  name: string;
  approvalState: ApprovalState;
  subscriptionStatus: SubscriptionStatus | 'expiring' | null;
  /** Only with `refunded`: F13 full vs partial refund (S57-PO-12). */
  refundScope: RefundScope | null;
  plansWaitingForDelivery: number;
  /** F23 food replacement requests still open for this client (T036). */
  pendingFoodReplacements: number;
  /** F15 new check-ins indicator for this client (T036). */
  newCheckIns?: number;
  /** FR-008 / S71-PO-9: expiring/expired filter indicator */
  expiryBucket?: 'expiring' | 'expired' | null;
  isExpiring?: boolean;
  /**
   * F11 assignment state; present only for callers passing
   * {@link canUseAssignment}. Never carries the trainer identity.
   */
  assignment?: AssignmentFilter | null;
  /**
   * F11 client code (`XXXX-XXXX`); present only for callers passing
   * {@link canUseAssignment} (#264: Platform Owner or the workspace's
   * Workspace Owner). Searchable by exact code for the same callers.
   */
  clientCode?: string;
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
  assignment?: SearchValue;
  expiry?: SearchValue;
  page?: SearchValue;
}): DirectoryQuery | null {
  const q = single(params.q);
  const approval = single(params.approval);
  const subscription = single(params.subscription);
  const assignment = single(params.assignment);
  const expiry = single(params.expiry);
  const page = single(params.page);
  if (
    q === null ||
    approval === null ||
    subscription === null ||
    assignment === null ||
    expiry === null ||
    page === null
  )
    return null;
  const search = q?.trim() ? q.trim() : null;
  if (search !== null && [...search].length > DIRECTORY_SEARCH_MAX) return null;
  let approvalState: ApprovalState | null = null;
  if (approval !== undefined && approval !== '') {
    if (!(APPROVAL_STATES as readonly string[]).includes(approval)) return null;
    approvalState = approval as ApprovalState;
  }
  let subscriptionStatus: SubscriptionStatus | 'expiring' | null = null;
  let expiryFilter: ExpiryFilter | null = null;
  if (subscription !== undefined && subscription !== '') {
    if (subscription === 'expiring') {
      subscriptionStatus = 'expiring';
      expiryFilter = 'expiring';
    } else if (
      !(SUBSCRIPTION_STATUSES as readonly string[]).includes(subscription)
    ) {
      return null;
    } else {
      subscriptionStatus = subscription as SubscriptionStatus;
      if (subscription === 'expired') {
        expiryFilter = 'expired';
      }
    }
  }
  if (expiry !== undefined && expiry !== '') {
    if (!(EXPIRY_FILTERS as readonly string[]).includes(expiry)) return null;
    const parsedExpiry = expiry as ExpiryFilter;
    if (parsedExpiry === 'expiring') {
      if (subscriptionStatus !== null && subscriptionStatus !== 'expiring') {
        return null;
      }
      subscriptionStatus = 'expiring';
      expiryFilter = 'expiring';
    } else if (parsedExpiry === 'expired') {
      if (subscriptionStatus !== null && subscriptionStatus !== 'expired') {
        return null;
      }
      subscriptionStatus = 'expired';
      expiryFilter = 'expired';
    }
  }
  let assignmentFilter: AssignmentFilter | null = null;
  if (assignment !== undefined && assignment !== '') {
    if (!(ASSIGNMENT_FILTERS as readonly string[]).includes(assignment))
      return null;
    assignmentFilter = assignment as AssignmentFilter;
  }
  let pageNumber = 1;
  if (page !== undefined && page !== '') {
    if (!/^[1-9][0-9]{0,3}$/u.test(page)) return null;
    pageNumber = Number(page);
    if (pageNumber > DIRECTORY_MAX_PAGE) return null;
  }
  return {
    search,
    approvalState,
    subscriptionStatus,
    assignment: assignmentFilter,
    page: pageNumber,
    ...(expiryFilter !== null ? { expiry: expiryFilter } : {}),
  };
}

/**
 * App-layer workspace wall: the same `coaching_work` capability and active
 * membership (or verified Platform Owner) that guards F20 Client Details.
 */
export function canReadDirectory(actor: Actor, workspaceId: unknown): boolean {
  return isUuid(workspaceId) && authorize(actor, 'coaching_work', workspaceId);
}

/**
 * App-layer copy of the F11 assignment wall (the predicate of
 * `public.unassigned_clients`): the Platform Owner, or a Workspace Owner of
 * this workspace. Trainers and Sales never filter by or see assignment, even
 * though they may read the directory. The database repeats the check.
 */
export function canUseAssignment(actor: Actor, workspaceId: unknown): boolean {
  return (
    isUuid(workspaceId) &&
    (actor.role === 'platform_owner' ||
      (actor.role === 'workspace_owner' &&
        actor.activeWorkspaceIds.includes(workspaceId)))
  );
}

/** The code-search hint follows the same role/workspace wall as code output. */
export function directorySearchPlaceholderKey(
  actor: Actor,
  workspaceId: unknown,
):
  | 'staff.clientDirectory.searchPlaceholder'
  | 'staff.clientDirectory.searchPlaceholderStaff' {
  return canUseAssignment(actor, workspaceId)
    ? 'staff.clientDirectory.searchPlaceholder'
    : 'staff.clientDirectory.searchPlaceholderStaff';
}

export type DirectoryIndicatorKind =
  'plansWaitingForDelivery' | 'pendingFoodReplacements' | 'newCheckIns';

/**
 * Links each indicator to its existing F15/F18/F19 owning surface (T037).
 * - Plans waiting for delivery (F19) -> `/clients/${clientId}`
 * - Food replacement requests (F18/F23) -> `/clients/${clientId}/progress`
 * - New check-ins (F15/F23) -> `/clients/${clientId}/progress`
 */
export function directoryIndicatorHref(
  kind: DirectoryIndicatorKind,
  clientId: string,
): string {
  switch (kind) {
    case 'plansWaitingForDelivery':
      return `/clients/${clientId}`;
    case 'pendingFoodReplacements':
    case 'newCheckIns':
      return `/clients/${clientId}/progress`;
  }
}

export function directoryRpcArgs(
  workspaceId: string,
  query: DirectoryQuery,
  assignmentAllowed = false,
) {
  return {
    p_workspace_id: workspaceId,
    p_search: query.search,
    p_approval_state: query.approvalState,
    p_subscription_status: query.subscriptionStatus,
    p_limit: DIRECTORY_PAGE_SIZE,
    p_offset: (query.page - 1) * DIRECTORY_PAGE_SIZE,
    p_assignment: assignmentAllowed ? query.assignment : null,
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
    refund_scope,
    plans_waiting_for_delivery,
    pending_food_replacements,
  } = value;
  const hasAssignment = 'assignment' in value;
  const hasCode = 'client_code' in value;
  const hasNewCheckIns = 'new_check_ins' in value;
  const hasExpiryBucket = 'expiry_bucket' in value;
  const hasIsExpiring = 'is_expiring' in value;
  if (
    Object.keys(value)
      .filter(
        (key) =>
          key !== 'assignment' &&
          key !== 'client_code' &&
          key !== 'new_check_ins' &&
          key !== 'expiry_bucket' &&
          key !== 'is_expiring',
      )
      .sort()
      .join(',') !==
      'approval_state,client_id,name,pending_food_replacements,plans_waiting_for_delivery,refund_scope,subscription_status' ||
    (hasCode &&
      !(
        typeof value.client_code === 'string' &&
        /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/u.test(value.client_code)
      )) ||
    typeof pending_food_replacements !== 'number' ||
    !Number.isSafeInteger(pending_food_replacements) ||
    pending_food_replacements < 0 ||
    (hasAssignment &&
      !(
        value.assignment === null ||
        (ASSIGNMENT_FILTERS as readonly unknown[]).includes(value.assignment)
      )) ||
    (hasNewCheckIns &&
      !(
        typeof value.new_check_ins === 'number' &&
        Number.isSafeInteger(value.new_check_ins) &&
        value.new_check_ins >= 0
      )) ||
    !isUuid(client_id) ||
    typeof name !== 'string' ||
    !(APPROVAL_STATES as readonly unknown[]).includes(approval_state) ||
    !(
      subscription_status === null ||
      subscription_status === 'expiring' ||
      (SUBSCRIPTION_STATUSES as readonly unknown[]).includes(
        subscription_status,
      )
    ) ||
    !(subscription_status === 'refunded'
      ? (REFUND_SCOPES as readonly unknown[]).includes(refund_scope)
      : refund_scope === null) ||
    typeof plans_waiting_for_delivery !== 'number' ||
    !Number.isSafeInteger(plans_waiting_for_delivery) ||
    plans_waiting_for_delivery < 0
  )
    return null;
  return {
    clientId: client_id,
    name,
    approvalState: approval_state as ApprovalState,
    subscriptionStatus: subscription_status as
      SubscriptionStatus | 'expiring' | null,
    refundScope: refund_scope as RefundScope | null,
    plansWaitingForDelivery: plans_waiting_for_delivery,
    pendingFoodReplacements: pending_food_replacements,
    ...(hasNewCheckIns ? { newCheckIns: value.new_check_ins as number } : {}),
    ...(hasCode ? { clientCode: value.client_code as string } : {}),
    ...(hasAssignment
      ? { assignment: value.assignment as AssignmentFilter | null }
      : {}),
    ...(hasExpiryBucket
      ? { expiryBucket: value.expiry_bucket as 'expiring' | 'expired' | null }
      : {}),
    ...(hasIsExpiring ? { isExpiring: Boolean(value.is_expiring) } : {}),
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
  if (query.subscriptionStatus) {
    params.set('subscription', query.subscriptionStatus);
  } else if (query.expiry) {
    params.set('subscription', query.expiry);
  }
  if (query.assignment) params.set('assignment', query.assignment);
  if (page > 1) params.set('page', String(page));
  return `/clients?${params.toString()}`;
}
