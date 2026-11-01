import { authorize, type Actor } from '../auth/authorize';

export type RenewalInput = {
  workspaceId: unknown;
  clientId: unknown;
  predecessorSubscriptionId: unknown;
  packageOfferId: unknown;
  requestKey: unknown;
  expectedRevision: unknown;
  renewalConfirmed: unknown;
  installments: unknown;
};

type RenewalInstallment = { amountMinor: string; dueOffsetDays: number };

export type RenewalRpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

export type RenewalReceipt = {
  operation_id: string;
  workspace_id: string;
  client_id: string;
  predecessor_subscription_id: string;
  subscription_id: string;
  package_version_id: string;
  price_minor: string;
  currency: string;
  duration_days: number;
  recording_date: string;
  service_start_date: string;
  service_end_exclusive: string;
};

export type RenewalResult =
  | { status: 'ok'; receipt: RenewalReceipt }
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
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RECEIPT_KEYS = [
  'operation_id',
  'workspace_id',
  'client_id',
  'predecessor_subscription_id',
  'subscription_id',
  'package_version_id',
  'price_minor',
  'currency',
  'duration_days',
  'recording_date',
  'service_start_date',
  'service_end_exclusive',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validInput(input: RenewalInput): boolean {
  const installmentsValid =
    input.installments === undefined ||
    input.installments === null ||
    (Array.isArray(input.installments) &&
      input.installments.length > 0 &&
      input.installments.every(
        (row: unknown) =>
          isRecord(row) &&
          typeof row.amountMinor === 'string' &&
          MINOR_UNITS.test(row.amountMinor) &&
          Number.isSafeInteger(row.dueOffsetDays) &&
          (row.dueOffsetDays as number) >= 0,
      ));
  return (
    typeof input.workspaceId === 'string' &&
    UUID.test(input.workspaceId) &&
    typeof input.clientId === 'string' &&
    UUID.test(input.clientId) &&
    typeof input.predecessorSubscriptionId === 'string' &&
    UUID.test(input.predecessorSubscriptionId) &&
    typeof input.packageOfferId === 'string' &&
    UUID.test(input.packageOfferId) &&
    typeof input.requestKey === 'string' &&
    UUID.test(input.requestKey) &&
    Number.isSafeInteger(input.expectedRevision) &&
    (input.expectedRevision as number) >= 0 &&
    (input.expectedRevision as number) < 2_147_483_647 &&
    input.renewalConfirmed === true &&
    installmentsValid
  );
}

function safeReceipt(value: unknown): RenewalReceipt | null {
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
    typeof value.predecessor_subscription_id !== 'string' ||
    !UUID.test(value.predecessor_subscription_id) ||
    typeof value.subscription_id !== 'string' ||
    !UUID.test(value.subscription_id) ||
    typeof value.package_version_id !== 'string' ||
    !UUID.test(value.package_version_id) ||
    typeof value.price_minor !== 'string' ||
    !MINOR_UNITS.test(value.price_minor) ||
    typeof value.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !Number.isSafeInteger(value.duration_days) ||
    (value.duration_days as number) <= 0 ||
    typeof value.recording_date !== 'string' ||
    !DATE.test(value.recording_date) ||
    typeof value.service_start_date !== 'string' ||
    !DATE.test(value.service_start_date) ||
    typeof value.service_end_exclusive !== 'string' ||
    !DATE.test(value.service_end_exclusive) ||
    value.service_start_date >= value.service_end_exclusive
  )
    return null;
  return Object.fromEntries(
    RECEIPT_KEYS.map((key) => [key, value[key]]),
  ) as RenewalReceipt;
}

/** Validates an authorized renewal request and accepts only its safe purchase snapshot receipt. */
export async function recordRenewal(
  input: RenewalInput,
  deps: { actor: Actor | null; client: RenewalRpcClient },
): Promise<RenewalResult> {
  try {
    if (
      !deps.actor ||
      typeof input.workspaceId !== 'string' ||
      !authorize(deps.actor, 'record_payment', input.workspaceId.toLowerCase())
    )
      return { status: 'not_permitted' };
    if (!validInput(input)) return { status: 'invalid_input' };
    const workspaceId = input.workspaceId.toLowerCase();
    const clientId = (input.clientId as string).toLowerCase();
    const predecessorSubscriptionId = (
      input.predecessorSubscriptionId as string
    ).toLowerCase();
    const packageOfferId = (input.packageOfferId as string).toLowerCase();
    const requestKey = (input.requestKey as string).toLowerCase();
    const installments =
      input.installments === undefined || input.installments === null
        ? null
        : (input.installments as RenewalInstallment[]);
    if (
      installments &&
      installments.length > 1 &&
      !authorize(deps.actor, 'configure_installment_schedule', workspaceId)
    )
      return { status: 'not_permitted' };

    const response = await deps.client.rpc('record_renewal', {
      request: {
        workspace_id: workspaceId,
        client_id: clientId,
        predecessor_subscription_id: predecessorSubscriptionId,
        package_offer_id: packageOfferId,
        request_key: requestKey,
        expected_revision: input.expectedRevision,
        renewal_confirmed: true,
        installments:
          installments?.map((row) => ({
            amount_minor: row.amountMinor,
            due_offset_days: row.dueOffsetDays,
          })) ?? null,
      },
    });
    if (response.error || !isRecord(response.data))
      return { status: 'unavailable' };
    const status = response.data.status;
    if (
      status === 'not_permitted' ||
      status === 'invalid_input' ||
      status === 'conflict' ||
      status === 'stale_state'
    )
      return { status };
    if (status !== 'ok') return { status: 'unavailable' };

    const receipt = safeReceipt(response.data.receipt);
    if (
      !receipt ||
      receipt.workspace_id !== workspaceId ||
      receipt.client_id !== clientId ||
      receipt.predecessor_subscription_id !== predecessorSubscriptionId
    )
      return { status: 'unavailable' };
    return { status: 'ok', receipt };
  } catch {
    return { status: 'unavailable' };
  }
}
