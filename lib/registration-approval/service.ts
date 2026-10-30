import 'server-only';
import { headers } from 'next/headers';
import { authorize } from '../auth/authorize';
import { loadActorRows } from '../auth/actor';
import { roleHasCapability, type Role } from '../auth/capabilities';
import { createSessionClient } from '../supabase/server';
import {
  mapRegistrationApprovalError,
  registrationApprovalResult,
  type RegistrationApprovalFailure,
} from './results';
import {
  parseApprovalInput,
  parseRejectionInput,
  type ApprovalInput,
} from './validation';

type Mutation = 'approve' | 'reject' | 'reconsider' | 'collect' | 'correct';
type RpcClient = Awaited<ReturnType<typeof createSessionClient>>;
type RecordInput = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RPC_NAMES: Record<Mutation, string> = {
  approve: 'registration_approve',
  reject: 'registration_reject',
  reconsider: 'registration_reconsider',
  collect: 'installment_collect',
  correct: 'collection_correct',
};
const RECEIPT_FIELDS = [
  'id',
  'operation',
  'workspace_id',
  'client_id',
  'subscription_id',
  'obligation_id',
  'event_id',
  'installment_seq',
  'revision',
  'outcome',
  'amount_minor',
  'currency',
  'collected_on',
  'recorded_at',
] as const;
const FAILURE_STATUSES = new Set([
  'not_permitted',
  'stale_state',
  'key_conflict',
  'unavailable',
]);

function object(value: unknown): value is RecordInput {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is RecordInput {
  return (
    object(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function validMinor(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year! % 4 === 0 && (year! % 100 !== 0 || year! % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year! > 0 &&
    month! > 0 &&
    month! <= 12 &&
    day! > 0 &&
    day! <= days[month! - 1]!
  );
}

function paymentInput(value: unknown): ApprovalInput | null {
  const parsed = parseApprovalInput(value);
  return parsed;
}

function collectInput(value: unknown): RecordInput | null {
  const keys = [
    'workspaceId',
    'clientId',
    'subscriptionId',
    'obligationId',
    'requestKey',
    'expectedInstallmentSeq',
    'expectedRevision',
    'expectedPreviousEventId',
    'expectedAmountMinor',
    'currency',
    'collectedOn',
    'paymentConfirmed',
  ];
  if (!hasExactKeys(value, keys)) return null;
  if (
    !validUuid(value.workspaceId) ||
    !validUuid(value.clientId) ||
    !validUuid(value.subscriptionId) ||
    !validUuid(value.obligationId) ||
    !validUuid(value.requestKey) ||
    !(
      value.expectedPreviousEventId === null ||
      validUuid(value.expectedPreviousEventId)
    ) ||
    !Number.isSafeInteger(value.expectedInstallmentSeq) ||
    Number(value.expectedInstallmentSeq) < 1 ||
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 0 ||
    !validMinor(value.expectedAmountMinor) ||
    value.expectedAmountMinor === '0' ||
    typeof value.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !validDate(value.collectedOn) ||
    value.paymentConfirmed !== true
  )
    return null;
  return value;
}

function correctInput(value: unknown): RecordInput | null {
  const keys = [
    'workspaceId',
    'clientId',
    'subscriptionId',
    'obligationId',
    'originalEventId',
    'requestKey',
    'expectedInstallmentSeq',
    'expectedRevision',
    'expectedPreviousEventId',
    'correctionConfirmed',
  ];
  if (!hasExactKeys(value, keys)) return null;
  if (
    !validUuid(value.workspaceId) ||
    !validUuid(value.clientId) ||
    !validUuid(value.subscriptionId) ||
    !validUuid(value.obligationId) ||
    !validUuid(value.originalEventId) ||
    !validUuid(value.requestKey) ||
    !(
      value.expectedPreviousEventId === null ||
      validUuid(value.expectedPreviousEventId)
    ) ||
    !Number.isSafeInteger(value.expectedInstallmentSeq) ||
    Number(value.expectedInstallmentSeq) < 1 ||
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 1 ||
    value.correctionConfirmed !== true
  )
    return null;
  return value;
}

function toRpcRequest(operation: Mutation, input: RecordInput): RecordInput {
  if (operation === 'approve' || operation === 'reconsider') {
    const approved = input as unknown as ApprovalInput;
    return {
      workspace_id: approved.workspaceId,
      client_id: approved.clientId,
      request_key: approved.requestKey,
      expected_state: operation === 'approve' ? 'pending-approval' : 'rejected',
      expected_installment_seq: 1,
      expected_amount_minor: approved.expectedAmountMinor,
      currency: approved.currency,
      collected_on: approved.collectedOn,
      payment_confirmed: true,
    };
  }
  if (operation === 'reject') {
    return {
      workspace_id: input.workspaceId,
      client_id: input.clientId,
      request_key: input.requestKey,
      expected_state: 'pending-approval',
      reason_code: 'registration_rejected',
    };
  }
  if (operation === 'collect') {
    return {
      workspace_id: input.workspaceId,
      client_id: input.clientId,
      subscription_id: input.subscriptionId,
      obligation_id: input.obligationId,
      request_key: input.requestKey,
      expected_installment_seq: input.expectedInstallmentSeq,
      expected_revision: input.expectedRevision,
      expected_previous_event_id: input.expectedPreviousEventId,
      expected_amount_minor: input.expectedAmountMinor,
      currency: input.currency,
      collected_on: input.collectedOn,
      payment_confirmed: true,
    };
  }
  return {
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    subscription_id: input.subscriptionId,
    obligation_id: input.obligationId,
    original_event_id: input.originalEventId,
    request_key: input.requestKey,
    expected_installment_seq: input.expectedInstallmentSeq,
    expected_revision: input.expectedRevision,
    expected_previous_event_id: input.expectedPreviousEventId,
    correction_confirmed: true,
  };
}

function sanitizeResult(
  data: unknown,
): RegistrationApprovalFailure | RecordInput {
  if (!object(data) || typeof data.status !== 'string')
    return { status: 'unavailable' };
  if (FAILURE_STATUSES.has(data.status))
    return { status: data.status as RegistrationApprovalFailure['status'] };
  if (data.status === 'invalid_input') {
    return registrationApprovalResult(
      'invalid_input',
      Array.isArray(data.fields)
        ? data.fields.filter(
            (field): field is string => typeof field === 'string',
          )
        : [],
    );
  }
  if (data.status !== 'ok' || !object(data.receipt))
    return { status: 'unavailable' };
  const receipt: RecordInput = {};
  for (const field of RECEIPT_FIELDS) {
    if (Object.hasOwn(data.receipt, field))
      receipt[field] = data.receipt[field];
  }
  if (
    !validUuid(receipt.id) ||
    !validUuid(receipt.workspace_id) ||
    !validUuid(receipt.client_id) ||
    typeof receipt.operation !== 'string' ||
    typeof receipt.outcome !== 'string' ||
    typeof receipt.recorded_at !== 'string'
  )
    return { status: 'unavailable' };
  return { status: 'ok', receipt };
}

function canPerform(role: Role | null, operation: Mutation): boolean {
  if (role === null) return false;
  if (
    (operation === 'correct' || operation === 'reconsider') &&
    role !== 'platform_owner'
  )
    return false;
  if (
    (operation === 'approve' || operation === 'reject') &&
    role !== 'platform_owner' &&
    role !== 'workspace_owner'
  )
    return false;
  const capability =
    operation === 'approve' ||
    operation === 'reject' ||
    operation === 'reconsider'
      ? 'approve_registration'
      : operation === 'collect'
        ? 'record_payment'
        : 'record_refund';
  return roleHasCapability(role, capability);
}

function inRequestOrigin(headersValue: Headers): boolean {
  const origin = headersValue.get('origin');
  if (!origin) return true; // Server Actions enforce Origin/Host when Origin is present.
  const host = headersValue.get('x-forwarded-host') ?? headersValue.get('host');
  if (!host) return false;
  try {
    return (
      new URL(origin).host.toLowerCase() ===
      host.split(',')[0]!.trim().toLowerCase()
    );
  } catch {
    return false;
  }
}

async function signedSession(): Promise<{
  client: NonNullable<RpcClient>;
  userId: string;
} | null> {
  const client = await createSessionClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { client, userId: data.user.id };
}

function validate(operation: Mutation, input: unknown): RecordInput | null {
  if (operation === 'approve' || operation === 'reconsider')
    return paymentInput(input) as unknown as RecordInput | null;
  if (operation === 'reject')
    return parseRejectionInput(input) as unknown as RecordInput | null;
  if (operation === 'collect') return collectInput(input);
  return correctInput(input);
}

export async function executeRegistrationApprovalAction(
  operation: Mutation,
  input: unknown,
): Promise<RegistrationApprovalFailure | RecordInput> {
  const parsed = validate(operation, input);
  if (!parsed) return registrationApprovalResult('invalid_input');
  try {
    if (!inRequestOrigin(await headers())) return { status: 'not_permitted' };
    const session = await signedSession();
    if (!session) return { status: 'not_permitted' };
    const actor = await loadActorRows(session.client, session.userId);
    const workspaceId = parsed.workspaceId as string;
    if (
      !actor ||
      !canPerform(actor.role, operation) ||
      !authorize(
        actor,
        operation === 'approve' ||
          operation === 'reject' ||
          operation === 'reconsider'
          ? 'approve_registration'
          : operation === 'collect'
            ? 'record_payment'
            : 'record_refund',
        workspaceId,
      )
    ) {
      return { status: 'not_permitted' };
    }
    const { data, error } = await session.client.rpc(RPC_NAMES[operation], {
      request: toRpcRequest(operation, parsed),
    });
    if (error) return mapRegistrationApprovalError(error);
    return sanitizeResult(data);
  } catch {
    return { status: 'unavailable' };
  }
}
