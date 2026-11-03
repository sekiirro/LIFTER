import { compareCairoDates } from '../time/cairo-calendar';

export type RefundLedgerHeaderInput = Readonly<{
  id: string;
  workspaceId: string;
  clientId: string;
  subscriptionId: string;
  operationId: string;
  actorUserId: string;
  amountMinor: string;
  currency: string;
  effectiveOn: string;
  expectedRevision: number;
}>;

export type RefundLedgerAllocationInput = Readonly<{
  obligationId: string;
  sourceCollectionEventId: string;
  principalMinor: string;
  commissionReversalMinor: string;
}>;

export type RefundLedgerBatchInput = Readonly<{
  header: RefundLedgerHeaderInput;
  allocations: readonly RefundLedgerAllocationInput[];
  cancelledObligationIds?: readonly string[];
}>;

export type RefundOperationRow = Readonly<{
  id: string;
  workspace_id: string;
  client_id: string;
  subscription_id: string;
  operation_id: string;
  actor_user_id: string;
  amount_minor: string;
  currency: string;
  effective_on: string;
  expected_revision: number;
}>;

export type RefundAllocationEventRow = Readonly<{
  workspace_id: string;
  subscription_id: string;
  obligation_id: string;
  refund_operation_id: string;
  source_collection_event_id: string;
  amount_minor: string;
  commission_minor: string;
  currency: string;
  effective_on: string;
  recorded_by: string;
}>;

export type ObligationCancellationRow = Readonly<{
  workspace_id: string;
  subscription_id: string;
  obligation_id: string;
  refund_operation_id: string;
  actor_user_id: string;
  effective_on: string;
}>;

export type RefundLedgerBatch = Readonly<{
  operation: RefundOperationRow;
  allocations: readonly RefundAllocationEventRow[];
  cancellations: readonly ObligationCancellationRow[];
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITIVE_MINOR = /^[1-9][0-9]{0,17}$/;
const NON_NEGATIVE_MINOR = /^(0|[1-9][0-9]{0,17})$/;

function requireUuid(value: string, label: string): void {
  if (!UUID.test(value)) throw new RangeError(`${label} must be a UUID`);
}

function requireDate(value: string): void {
  compareCairoDates(value, value);
}

/**
 * Maps a single-purchase refund aggregate into append-only database rows.
 * Positive domain amounts become negative allocation deltas at the ledger edge.
 */
export function buildRefundLedgerBatch(
  input: RefundLedgerBatchInput,
): RefundLedgerBatch {
  const { header } = input;
  for (const [value, label] of [
    [header.id, 'Refund operation ID'],
    [header.workspaceId, 'Workspace ID'],
    [header.clientId, 'Client ID'],
    [header.subscriptionId, 'Subscription ID'],
    [header.operationId, 'Registration operation ID'],
    [header.actorUserId, 'Actor user ID'],
  ] as const) {
    requireUuid(value, label);
  }
  if (!POSITIVE_MINOR.test(header.amountMinor))
    throw new RangeError('Refund amount must be positive minor units');
  if (!/^[A-Z]{3}$/.test(header.currency))
    throw new RangeError('Currency must be an uppercase ISO code');
  if (
    !Number.isSafeInteger(header.expectedRevision) ||
    header.expectedRevision < 0
  )
    throw new RangeError(
      'Expected revision must be a non-negative safe integer',
    );
  requireDate(header.effectiveOn);
  if (input.allocations.length === 0)
    throw new RangeError('Refund must include at least one allocation');

  const seenSources = new Set<string>();
  let allocatedPrincipal = 0n;
  const allocations = input.allocations.map((allocation) => {
    requireUuid(allocation.obligationId, 'Obligation ID');
    requireUuid(allocation.sourceCollectionEventId, 'Collection event ID');
    const sourceKey = allocation.sourceCollectionEventId.toLowerCase();
    if (seenSources.has(sourceKey))
      throw new RangeError('Refund may allocate each source only once');
    seenSources.add(sourceKey);
    if (!POSITIVE_MINOR.test(allocation.principalMinor))
      throw new RangeError('Allocation principal must be positive minor units');
    if (!NON_NEGATIVE_MINOR.test(allocation.commissionReversalMinor))
      throw new RangeError(
        'Commission reversal must be non-negative minor units',
      );
    allocatedPrincipal += BigInt(allocation.principalMinor);
    return {
      workspace_id: header.workspaceId,
      subscription_id: header.subscriptionId,
      obligation_id: allocation.obligationId,
      refund_operation_id: header.id,
      source_collection_event_id: allocation.sourceCollectionEventId,
      amount_minor: `-${allocation.principalMinor}`,
      commission_minor: `-${allocation.commissionReversalMinor}`,
      currency: header.currency,
      effective_on: header.effectiveOn,
      recorded_by: header.actorUserId,
    } satisfies RefundAllocationEventRow;
  });
  if (allocatedPrincipal !== BigInt(header.amountMinor))
    throw new RangeError(
      'Allocation principal must equal the refund aggregate',
    );

  const seenObligations = new Set<string>();
  const cancellations = (input.cancelledObligationIds ?? []).map(
    (obligationId) => {
      requireUuid(obligationId, 'Cancelled obligation ID');
      const key = obligationId.toLowerCase();
      if (seenObligations.has(key))
        throw new RangeError('An obligation may be cancelled only once');
      seenObligations.add(key);
      return {
        workspace_id: header.workspaceId,
        subscription_id: header.subscriptionId,
        obligation_id: obligationId,
        refund_operation_id: header.id,
        actor_user_id: header.actorUserId,
        effective_on: header.effectiveOn,
      } satisfies ObligationCancellationRow;
    },
  );

  return {
    operation: {
      id: header.id,
      workspace_id: header.workspaceId,
      client_id: header.clientId,
      subscription_id: header.subscriptionId,
      operation_id: header.operationId,
      actor_user_id: header.actorUserId,
      amount_minor: header.amountMinor,
      currency: header.currency,
      effective_on: header.effectiveOn,
      expected_revision: header.expectedRevision,
    },
    allocations,
    cancellations,
  };
}
