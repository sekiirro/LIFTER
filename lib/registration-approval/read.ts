import 'server-only';
import { authorize } from '../auth/authorize';
import { loadActorRows } from '../auth/actor';
import { createSessionClient } from '../supabase/server';

type ReadFailure = { status: 'not_permitted' | 'unavailable' };
type SafeResult = Record<string, unknown>;
export type WorkspacePaymentQueueAmount = {
  currency: string;
  unpaid_minor: string;
};
export type WorkspacePaymentQueueItem = {
  client_id: string;
  subscription_id: string;
  name: string;
  approval_state: string;
  price_minor: string;
  currency: string;
  unpaid_by_currency: WorkspacePaymentQueueAmount[];
};
export type WorkspacePaymentQueueResult =
  | ReadFailure
  | {
      status: 'ok';
      items: WorkspacePaymentQueueItem[];
      totals: WorkspacePaymentQueueAmount[];
      next_cursor: string | null;
    };
type Session = {
  client: NonNullable<Awaited<ReturnType<typeof createSessionClient>>>;
  actor: NonNullable<Awaited<ReturnType<typeof loadActorRows>>>;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUEUE_ITEM_FIELDS = [
  'client_id',
  'name',
  'signup_time',
  'approval_state',
  'offer_version_label',
  'price_minor',
  'currency',
] as const;
const PAYMENT_QUEUE_FIELDS = [
  'client_id',
  'subscription_id',
  'name',
  'approval_state',
  'price_minor',
  'currency',
  'unpaid_by_currency',
] as const;
const OBLIGATION_FIELDS = [
  'obligation_id',
  'seq',
  'amount_minor',
  'currency',
  'due_on',
  'paid',
  'revision',
  'tail_event_id',
  'kind',
  'collected_on',
  'effective_on',
  'recorded_by',
] as const;
const COMMISSION_FIELDS = [
  'event_id',
  'installment_seq',
  'revision',
  'kind',
  'rate_bp',
  'commission_minor',
  'reverses_event_id',
] as const;

function object(value: unknown): value is SafeResult {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pick(value: unknown, fields: readonly string[]): SafeResult {
  if (!object(value)) return {};
  const result: SafeResult = {};
  for (const field of fields)
    if (Object.hasOwn(value, field)) result[field] = value[field];
  return result;
}

function currencyAmounts(value: unknown): WorkspacePaymentQueueAmount[] | null {
  if (!Array.isArray(value)) return null;
  const amounts: WorkspacePaymentQueueAmount[] = [];
  for (const entry of value) {
    if (
      !object(entry) ||
      typeof entry.currency !== 'string' ||
      !/^[A-Z]{3}$/.test(entry.currency) ||
      typeof entry.unpaid_minor !== 'string' ||
      !/^[0-9]+$/.test(entry.unpaid_minor)
    )
      return null;
    amounts.push({
      currency: entry.currency,
      unpaid_minor: entry.unpaid_minor,
    });
  }
  return amounts;
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function safeStatus(
  value: unknown,
): 'not_permitted' | 'unavailable' | 'stale_state' | 'key_conflict' | null {
  if (!object(value) || typeof value.status !== 'string') return null;
  if (
    ['not_permitted', 'unavailable', 'stale_state', 'key_conflict'].includes(
      value.status,
    )
  )
    return value.status as ReturnType<typeof safeStatus>;
  return null;
}

async function signedSession(): Promise<Session | null> {
  const client = await createSessionClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const actor = await loadActorRows(client, data.user.id);
  return actor ? { client, actor } : null;
}

async function authorizedSession(
  workspaceId: string,
  capability: 'approve_registration' | 'record_payment',
  ownersOnly: boolean,
): Promise<Session | ReadFailure> {
  if (!uuid(workspaceId)) return { status: 'not_permitted' };
  const session = await signedSession();
  if (
    !session ||
    !authorize(session.actor, capability, workspaceId) ||
    (ownersOnly &&
      session.actor.role !== 'platform_owner' &&
      session.actor.role !== 'workspace_owner')
  )
    return { status: 'not_permitted' };
  return session;
}

function isFailure(value: Session | ReadFailure): value is ReadFailure {
  return 'status' in value;
}

async function callReader(
  name: string,
  args: Record<string, unknown>,
  workspaceId: string,
  capability: 'approve_registration' | 'record_payment',
  ownersOnly: boolean,
): Promise<unknown | ReadFailure> {
  try {
    const session = await authorizedSession(
      workspaceId,
      capability,
      ownersOnly,
    );
    if (isFailure(session)) return session;
    const { data, error } = await session.client.rpc(name, args);
    if (error) return { status: 'unavailable' };
    return data;
  } catch {
    return { status: 'unavailable' };
  }
}

function pagination(
  input: unknown,
): { workspaceId: string; cursorId: string | null; pageSize: number } | null {
  if (!object(input) || !uuid(input.workspaceId)) return null;
  if (
    Object.keys(input).some(
      (key) => !['workspaceId', 'cursorId', 'pageSize'].includes(key),
    )
  )
    return null;
  const cursorId = input.cursorId ?? null;
  const pageSize = input.pageSize ?? 20;
  if (
    !(cursorId === null || uuid(cursorId)) ||
    !Number.isSafeInteger(pageSize) ||
    Number(pageSize) < 1 ||
    Number(pageSize) > 100
  )
    return null;
  return {
    workspaceId: input.workspaceId,
    cursorId,
    pageSize: Number(pageSize),
  };
}

function okQueue(
  data: unknown,
  fields: readonly string[],
  includePaymentTotals = false,
): SafeResult | ReadFailure {
  const failure = safeStatus(data);
  if (failure)
    return {
      status: failure === 'not_permitted' ? 'not_permitted' : 'unavailable',
    };
  if (!object(data) || data.status !== 'ok' || !Array.isArray(data.items))
    return { status: 'unavailable' };
  const items: SafeResult[] = [];
  for (const item of data.items) {
    const projected = pick(item, fields);
    if (fields.includes('unpaid_by_currency')) {
      const amounts = object(item)
        ? currencyAmounts(item.unpaid_by_currency)
        : null;
      if (amounts === null) return { status: 'unavailable' };
      projected.unpaid_by_currency = amounts;
    }
    items.push(projected);
  }
  if (includePaymentTotals && !Array.isArray(data.totals))
    return { status: 'unavailable' };
  const cursor = data.next_cursor ?? null;
  if (!(cursor === null || uuid(cursor))) return { status: 'unavailable' };
  const result: SafeResult = { status: 'ok', items };
  if (includePaymentTotals)
    result.totals = (data.totals as unknown[]).map((item) =>
      pick(item, ['currency', 'unpaid_minor']),
    );
  result.next_cursor = cursor;
  return result;
}

export async function readRegistrationApprovalQueue(
  input: unknown,
): Promise<SafeResult | ReadFailure> {
  const page = pagination(input);
  if (!page) return { status: 'not_permitted' };
  const data = await callReader(
    'registration_approval_queue',
    {
      workspace_id: page.workspaceId,
      cursor_id: page.cursorId,
      page_size: page.pageSize,
    },
    page.workspaceId,
    'approve_registration',
    true,
  );
  if (object(data) && data.status && data.status !== 'ok')
    return {
      status: data.status === 'not_permitted' ? 'not_permitted' : 'unavailable',
    };
  return okQueue(data, QUEUE_ITEM_FIELDS);
}

export async function readRegistrationApprovalReview(
  input: unknown,
): Promise<SafeResult | ReadFailure> {
  if (
    !object(input) ||
    !uuid(input.workspaceId) ||
    !uuid(input.clientId) ||
    Object.keys(input).some((key) => !['workspaceId', 'clientId'].includes(key))
  )
    return { status: 'not_permitted' };
  const data = await callReader(
    'registration_approval_review',
    { workspace_id: input.workspaceId, client_id: input.clientId },
    input.workspaceId,
    'approve_registration',
    true,
  );
  if (object(data) && data.status && data.status !== 'ok')
    return {
      status: data.status === 'not_permitted' ? 'not_permitted' : 'unavailable',
    };
  if (!object(data) || data.status !== 'ok' || !object(data.item))
    return { status: 'unavailable' };
  const item = pick(data.item, [...QUEUE_ITEM_FIELDS, 'installments']);
  if (Array.isArray(item.installments))
    item.installments = item.installments.map((row) =>
      pick(row, ['seq', 'amount_minor', 'currency', 'issued_day_offset']),
    );
  return { status: 'ok', item };
}

export async function readRegistrationApprovalCorrection(
  input: unknown,
): Promise<
  | {
      status: 'ok';
      subscriptionId: string | null;
      corrections: {
        seq: number;
        obligationId: string;
        revision: number;
        tailEventId: string;
      }[];
    }
  | ReadFailure
> {
  if (
    !object(input) ||
    !uuid(input.workspaceId) ||
    !uuid(input.clientId) ||
    Object.keys(input).some((key) => !['workspaceId', 'clientId'].includes(key))
  )
    return { status: 'not_permitted' };
  const session = await signedSession();
  if (
    !session ||
    session.actor.role !== 'platform_owner' ||
    !authorize(session.actor, 'approve_registration', input.workspaceId)
  )
    return { status: 'not_permitted' };
  try {
    const { data, error } = await session.client.rpc(
      'registration_approval_correction',
      { workspace_id: input.workspaceId, client_id: input.clientId },
    );
    if (error) return { status: 'unavailable' };
    if (object(data) && data.status === 'not_permitted')
      return { status: 'not_permitted' };
    if (
      !object(data) ||
      data.status !== 'ok' ||
      !(data.subscription_id === null || uuid(data.subscription_id)) ||
      !object(data.corrections)
    )
      return { status: 'unavailable' };
    const corrections: {
      seq: number;
      obligationId: string;
      revision: number;
      tailEventId: string;
    }[] = [];
    for (const [sequence, row] of Object.entries(data.corrections)) {
      if (
        !/^[1-9]\d*$/.test(sequence) ||
        !Number.isSafeInteger(Number(sequence)) ||
        !object(row) ||
        !uuid(row.obligation_id) ||
        !Number.isSafeInteger(row.revision) ||
        Number(row.revision) < 1 ||
        !uuid(row.tail_event_id)
      )
        return { status: 'unavailable' };
      corrections.push({
        seq: Number(sequence),
        obligationId: row.obligation_id,
        revision: Number(row.revision),
        tailEventId: row.tail_event_id,
      });
    }
    if (data.subscription_id === null && corrections.length > 0)
      return { status: 'unavailable' };
    return {
      status: 'ok',
      subscriptionId: data.subscription_id,
      corrections,
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function readWorkspacePaymentQueue(
  input: unknown,
): Promise<WorkspacePaymentQueueResult> {
  const page = pagination(input);
  if (!page) return { status: 'not_permitted' };
  const data = await callReader(
    'workspace_payment_queue',
    {
      workspace_id: page.workspaceId,
      cursor_id: page.cursorId,
      page_size: page.pageSize,
    },
    page.workspaceId,
    'record_payment',
    false,
  );
  if (object(data) && data.status && data.status !== 'ok')
    return {
      status: data.status === 'not_permitted' ? 'not_permitted' : 'unavailable',
    };
  const result = okQueue(data, PAYMENT_QUEUE_FIELDS, true);
  const safeResult = result as SafeResult;
  if (
    safeResult.status !== 'ok' ||
    !Array.isArray(safeResult.items) ||
    !Array.isArray(safeResult.totals) ||
    !(safeResult.next_cursor === null || uuid(safeResult.next_cursor))
  )
    return { status: 'unavailable' };
  return {
    status: 'ok',
    items: safeResult.items as WorkspacePaymentQueueItem[],
    totals: safeResult.totals as WorkspacePaymentQueueAmount[],
    next_cursor: safeResult.next_cursor,
  };
}

export async function readSubscriptionPaymentStatus(
  input: unknown,
): Promise<SafeResult | ReadFailure> {
  if (
    !object(input) ||
    !uuid(input.workspaceId) ||
    !uuid(input.clientId) ||
    !uuid(input.subscriptionId) ||
    Object.keys(input).some(
      (key) => !['workspaceId', 'clientId', 'subscriptionId'].includes(key),
    )
  )
    return { status: 'not_permitted' };
  const data = await callReader(
    'subscription_payment_status',
    {
      workspace_id: input.workspaceId,
      client_id: input.clientId,
      subscription_id: input.subscriptionId,
    },
    input.workspaceId,
    'record_payment',
    false,
  );
  if (object(data) && data.status && data.status !== 'ok')
    return {
      status: data.status === 'not_permitted' ? 'not_permitted' : 'unavailable',
    };
  if (!object(data) || data.status !== 'ok' || !Array.isArray(data.obligations))
    return { status: 'unavailable' };
  return {
    status: 'ok',
    obligations: data.obligations.map((row) => pick(row, OBLIGATION_FIELDS)),
  };
}

export async function readSubscriptionCommission(
  input: unknown,
): Promise<SafeResult | ReadFailure> {
  if (
    !object(input) ||
    !uuid(input.workspaceId) ||
    !uuid(input.subscriptionId) ||
    Object.keys(input).some(
      (key) => !['workspaceId', 'subscriptionId'].includes(key),
    )
  )
    return { status: 'not_permitted' };
  const data = await callReader(
    'subscription_commission',
    {
      workspace_id: input.workspaceId,
      subscription_id: input.subscriptionId,
    },
    input.workspaceId,
    'record_payment',
    true,
  );
  if (object(data) && data.status && data.status !== 'ok')
    return {
      status: data.status === 'not_permitted' ? 'not_permitted' : 'unavailable',
    };
  if (!object(data) || data.status !== 'ok' || !Array.isArray(data.events))
    return { status: 'unavailable' };
  return {
    status: 'ok',
    events: data.events.map((row) => pick(row, COMMISSION_FIELDS)),
  };
}
