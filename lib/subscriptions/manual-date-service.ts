import 'server-only';
import type { Actor } from '../auth/authorize';
import { getActor } from '../auth/actor';
import { createSessionClient } from '../supabase/server';

type RpcResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};
export type ManualDateRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
};
export type ManualDateActor = Actor;

export type ManualDateInput = {
  workspaceId: unknown;
  clientId: unknown;
  subscriptionId: unknown;
  newServiceStartDate: unknown;
  newServiceEndExclusive: unknown;
  requestKey: unknown;
};

export type ManualDateReceipt = {
  operation_id: string;
  workspace_id: string;
  client_id: string;
  subscription_id: string;
  new_service_start_date: string;
  new_service_end_exclusive: string;
};

export type ManualDateResult =
  | { status: 'ok'; receipt: ManualDateReceipt }
  | {
      status: 'not_permitted' | 'invalid_input' | 'conflict' | 'unavailable';
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RECEIPT_KEYS = [
  'operation_id',
  'workspace_id',
  'client_id',
  'subscription_id',
  'new_service_start_date',
  'new_service_end_exclusive',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (
    !Number.isSafeInteger(year) ||
    !Number.isSafeInteger(month) ||
    !Number.isSafeInteger(day)
  )
    return false;
  if (month! < 1 || month! > 12 || day! < 1 || day! > 31) return false;
  const daysInMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return day! <= daysInMonth;
}

function validInput(input: ManualDateInput): boolean {
  return (
    typeof input.workspaceId === 'string' &&
    UUID.test(input.workspaceId) &&
    typeof input.clientId === 'string' &&
    UUID.test(input.clientId) &&
    typeof input.subscriptionId === 'string' &&
    UUID.test(input.subscriptionId) &&
    isCalendarDate(input.newServiceStartDate) &&
    isCalendarDate(input.newServiceEndExclusive) &&
    (input.newServiceEndExclusive as string) >
      (input.newServiceStartDate as string) &&
    typeof input.requestKey === 'string' &&
    UUID.test(input.requestKey)
  );
}

function safeReceipt(value: unknown): ManualDateReceipt | null {
  if (!isRecord(value) || Object.keys(value).length !== RECEIPT_KEYS.length)
    return null;
  if (!RECEIPT_KEYS.every((key) => Object.hasOwn(value, key))) return null;
  if (
    typeof value.operation_id !== 'string' ||
    !UUID.test(value.operation_id) ||
    typeof value.workspace_id !== 'string' ||
    !UUID.test(value.workspace_id) ||
    typeof value.client_id !== 'string' ||
    !UUID.test(value.client_id) ||
    typeof value.subscription_id !== 'string' ||
    !UUID.test(value.subscription_id) ||
    !isCalendarDate(value.new_service_start_date) ||
    !isCalendarDate(value.new_service_end_exclusive) ||
    (value.new_service_end_exclusive as string) <=
      (value.new_service_start_date as string)
  )
    return null;
  return {
    operation_id: value.operation_id,
    workspace_id: value.workspace_id,
    client_id: value.client_id,
    subscription_id: value.subscription_id,
    new_service_start_date: value.new_service_start_date,
    new_service_end_exclusive: value.new_service_end_exclusive,
  };
}

/** Validates the Platform-Owner-only request and invokes the audited, zero-revenue date-adjustment operation. */
export async function recordManualDateAdjustment(
  input: ManualDateInput,
  deps: { actor: ManualDateActor | null; client: ManualDateRpcClient },
): Promise<ManualDateResult> {
  try {
    if (!deps.actor || deps.actor.role !== 'platform_owner') {
      return { status: 'not_permitted' };
    }
    if (!validInput(input)) return { status: 'invalid_input' };
    const workspaceId = (input.workspaceId as string).toLowerCase();
    const clientId = (input.clientId as string).toLowerCase();
    const subscriptionId = (input.subscriptionId as string).toLowerCase();
    const requestKey = (input.requestKey as string).toLowerCase();

    const result = await deps.client.rpc(
      'record_subscription_date_adjustment',
      {
        request: {
          workspace_id: workspaceId,
          client_id: clientId,
          subscription_id: subscriptionId,
          new_service_start_date: input.newServiceStartDate,
          new_service_end_exclusive: input.newServiceEndExclusive,
          request_key: requestKey,
        },
      },
    );
    if (result.error) return { status: 'unavailable' };
    const response = result.data;
    if (!isRecord(response) || typeof response.status !== 'string')
      return { status: 'unavailable' };
    if (response.status === 'not_permitted') return { status: 'not_permitted' };
    if (response.status === 'invalid_input') return { status: 'invalid_input' };
    if (response.status === 'key_conflict') return { status: 'conflict' };
    if (response.status !== 'ok') return { status: 'unavailable' };
    const receipt = safeReceipt(response.receipt);
    if (
      !receipt ||
      receipt.workspace_id !== workspaceId ||
      receipt.client_id !== clientId ||
      receipt.subscription_id !== subscriptionId ||
      receipt.new_service_start_date !== input.newServiceStartDate ||
      receipt.new_service_end_exclusive !== input.newServiceEndExclusive
    )
      return { status: 'unavailable' };
    return { status: 'ok', receipt };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Production entry point; Platform-Owner authorization occurs before the RPC can load a replay receipt. */
export async function submitManualDateAdjustment(
  input: ManualDateInput,
): Promise<ManualDateResult> {
  try {
    const [actor, client] = await Promise.all([
      getActor(),
      createSessionClient(),
    ]);
    if (!client) return { status: 'unavailable' };
    return await recordManualDateAdjustment(input, {
      actor,
      client: client as unknown as ManualDateRpcClient,
    });
  } catch {
    return { status: 'unavailable' };
  }
}
