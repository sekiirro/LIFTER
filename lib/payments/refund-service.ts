import 'server-only';
import { authorize } from '../auth/authorize';
import type { Actor } from '../auth/authorize';
import { getActor } from '../auth/actor';
import { createSessionClient } from '../supabase/server';

type RpcResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};
export type RefundRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
};
export type RefundActor = Actor;

export type RefundInput = {
  workspaceId: unknown;
  clientId: unknown;
  purchaseId: unknown;
  requestKey: unknown;
  amountMinor: unknown;
  externalConfirmation: unknown;
  expectedRevision?: unknown;
};

export type RefundReceipt = {
  operation_id: string;
  workspace_id: string;
  client_id: string;
  purchase_id: string;
  amount_minor: string;
  currency: string;
};

export type RefundResult =
  | { status: 'ok'; receipt: RefundReceipt }
  | {
      status:
        | 'not_permitted'
        | 'invalid_input'
        | 'conflict'
        | 'stale_state'
        | 'unavailable';
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINOR_UNITS = /^[1-9][0-9]{0,17}$/;
const MAX_EXPECTED_REVISION = 999_999_999;
const RECEIPT_KEYS = [
  'operation_id',
  'workspace_id',
  'client_id',
  'purchase_id',
  'amount_minor',
  'currency',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validInput(input: RefundInput): boolean {
  return (
    typeof input.workspaceId === 'string' &&
    UUID.test(input.workspaceId) &&
    typeof input.clientId === 'string' &&
    UUID.test(input.clientId) &&
    typeof input.purchaseId === 'string' &&
    UUID.test(input.purchaseId) &&
    typeof input.requestKey === 'string' &&
    UUID.test(input.requestKey) &&
    typeof input.amountMinor === 'string' &&
    MINOR_UNITS.test(input.amountMinor) &&
    input.externalConfirmation === true &&
    (input.expectedRevision === undefined ||
      (typeof input.expectedRevision === 'number' &&
        Number.isInteger(input.expectedRevision) &&
        input.expectedRevision >= 0 &&
        input.expectedRevision <= MAX_EXPECTED_REVISION))
  );
}

function safeReceipt(value: unknown): RefundReceipt | null {
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
    typeof value.purchase_id !== 'string' ||
    !UUID.test(value.purchase_id) ||
    typeof value.amount_minor !== 'string' ||
    !MINOR_UNITS.test(value.amount_minor) ||
    typeof value.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(value.currency)
  )
    return null;
  return {
    operation_id: value.operation_id,
    workspace_id: value.workspace_id,
    client_id: value.client_id,
    purchase_id: value.purchase_id,
    amount_minor: value.amount_minor,
    currency: value.currency,
  };
}

/** Validates the PO request and invokes the atomic, authorization-rechecking refund operation. */
export async function recordRefund(
  input: RefundInput,
  deps: { actor: RefundActor | null; client: RefundRpcClient },
): Promise<RefundResult> {
  try {
    if (
      !deps.actor ||
      deps.actor.role !== 'platform_owner' ||
      typeof input.workspaceId !== 'string' ||
      !authorize(deps.actor, 'record_refund', input.workspaceId)
    ) {
      return { status: 'not_permitted' };
    }
    if (!validInput(input)) return { status: 'invalid_input' };
    const workspaceId = (input.workspaceId as string).toLowerCase();
    const clientId = (input.clientId as string).toLowerCase();
    const purchaseId = (input.purchaseId as string).toLowerCase();
    const requestKey = (input.requestKey as string).toLowerCase();

    const result = await deps.client.rpc('record_refund', {
      request: {
        workspace_id: workspaceId,
        client_id: clientId,
        purchase_id: purchaseId,
        request_key: requestKey,
        amount_minor: input.amountMinor,
        external_confirmation: true,
        ...(input.expectedRevision === undefined
          ? {}
          : { expected_revision: input.expectedRevision }),
      },
    });
    if (result.error) return { status: 'unavailable' };
    const response = result.data;
    if (!isRecord(response) || typeof response.status !== 'string')
      return { status: 'unavailable' };
    if (response.status === 'not_permitted') return { status: 'not_permitted' };
    if (response.status === 'invalid_input') return { status: 'invalid_input' };
    if (response.status === 'key_conflict') return { status: 'conflict' };
    if (response.status === 'stale_state') return { status: 'stale_state' };
    if (response.status !== 'ok') return { status: 'unavailable' };
    const receipt = safeReceipt(response.receipt);
    if (
      !receipt ||
      receipt.workspace_id !== workspaceId ||
      receipt.client_id !== clientId ||
      receipt.purchase_id !== purchaseId ||
      receipt.amount_minor !== input.amountMinor
    )
      return { status: 'unavailable' };
    return { status: 'ok', receipt };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Production entry point; authorization occurs before the RPC can load a replay receipt. */
export async function submitRefund(input: RefundInput): Promise<RefundResult> {
  try {
    const [actor, client] = await Promise.all([
      getActor(),
      createSessionClient(),
    ]);
    if (!client) return { status: 'unavailable' };
    return await recordRefund(input, {
      actor,
      client: client as unknown as RefundRpcClient,
    });
  } catch {
    return { status: 'unavailable' };
  }
}
