import { compareCairoDates } from '../time/cairo-calendar';

export type RefundCollectionSource = {
  eventId: string;
  collectedOn: string;
  installmentSequence: number;
  collectedPrincipal: number;
  storedCommission: number;
  refundedPrincipal?: number;
};

export type RefundAllocation = {
  sourceEventId: string;
  principalAmount: number;
  commissionReversalAmount: number;
  cumulativeRefundedPrincipal: number;
  cumulativeCommissionTarget: number;
};

type NormalizedSource = RefundCollectionSource & {
  normalizedEventId: string;
  refundedPrincipal: number;
};

function requireSafeInteger(
  value: number,
  label: string,
  minimum: number,
): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be a safe integer`);
  }
}

function normalizeSources(
  sources: readonly RefundCollectionSource[],
): NormalizedSource[] {
  const seenEventIds = new Set<string>();
  return sources.map((source) => {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        source.eventId,
      )
    ) {
      throw new RangeError('Collection event ID must be a UUID');
    }
    const normalizedEventId = source.eventId.toLowerCase();
    if (seenEventIds.has(normalizedEventId))
      throw new RangeError('Collection event IDs must be unique');
    seenEventIds.add(normalizedEventId);

    compareCairoDates(source.collectedOn, source.collectedOn);
    requireSafeInteger(source.installmentSequence, 'Installment sequence', 1);
    requireSafeInteger(source.collectedPrincipal, 'Collected principal', 1);
    requireSafeInteger(source.storedCommission, 'Stored commission', 0);
    const refundedPrincipal = source.refundedPrincipal ?? 0;
    requireSafeInteger(refundedPrincipal, 'Previously refunded principal', 0);
    if (refundedPrincipal > source.collectedPrincipal) {
      throw new RangeError(
        'Previously refunded principal exceeds collected principal',
      );
    }

    return { ...source, normalizedEventId, refundedPrincipal };
  });
}

/** Exact cumulative round-half-up commission target for one collection source. */
function cumulativeCommissionTarget(
  collectedPrincipal: number,
  storedCommission: number,
  refundedPrincipal: number,
): number {
  const amount = BigInt(collectedPrincipal);
  const commission = BigInt(storedCommission);
  const refunded = BigInt(refundedPrincipal);
  const target = (2n * commission * refunded + amount) / (2n * amount);
  const result = Number(target);
  if (!Number.isSafeInteger(result))
    throw new RangeError('Commission target exceeds the safe integer range');
  return result;
}

/**
 * Allocates a positive refund across active collection sources in deterministic
 * FIFO order, using cumulative source-level commission targets and exact integer
 * arithmetic. Inputs must contain only eligible, uncorrected collection tails.
 */
export function allocateRefund(
  requestedPrincipal: number,
  inputSources: readonly RefundCollectionSource[],
): RefundAllocation[] {
  requireSafeInteger(requestedPrincipal, 'Refund principal', 1);
  const sources = normalizeSources(inputSources).sort((left, right) => {
    const dateOrder = compareCairoDates(left.collectedOn, right.collectedOn);
    if (dateOrder !== 0) return dateOrder;
    if (left.installmentSequence !== right.installmentSequence) {
      return left.installmentSequence - right.installmentSequence;
    }
    return left.normalizedEventId < right.normalizedEventId
      ? -1
      : left.normalizedEventId > right.normalizedEventId
        ? 1
        : 0;
  });

  let totalRefundable = 0n;
  for (const source of sources) {
    totalRefundable += BigInt(
      source.collectedPrincipal - source.refundedPrincipal,
    );
  }
  if (BigInt(requestedPrincipal) > totalRefundable) {
    throw new RangeError(
      'Refund principal exceeds the remaining collection balance',
    );
  }

  let remaining = requestedPrincipal;
  const allocations: RefundAllocation[] = [];
  for (const source of sources) {
    if (remaining === 0) break;
    const residual = source.collectedPrincipal - source.refundedPrincipal;
    if (residual === 0) continue;

    const principalAmount = Math.min(remaining, residual);
    const cumulativeRefundedPrincipal =
      source.refundedPrincipal + principalAmount;
    const previousTarget = cumulativeCommissionTarget(
      source.collectedPrincipal,
      source.storedCommission,
      source.refundedPrincipal,
    );
    const cumulativeCommissionTargetValue = cumulativeCommissionTarget(
      source.collectedPrincipal,
      source.storedCommission,
      cumulativeRefundedPrincipal,
    );
    const commissionReversalAmount =
      cumulativeCommissionTargetValue - previousTarget;
    if (
      commissionReversalAmount < 0 ||
      cumulativeCommissionTargetValue > source.storedCommission
    ) {
      throw new RangeError(
        'Commission reversal exceeds the stored source commission',
      );
    }

    allocations.push({
      sourceEventId: source.normalizedEventId,
      principalAmount,
      commissionReversalAmount,
      cumulativeRefundedPrincipal,
      cumulativeCommissionTarget: cumulativeCommissionTargetValue,
    });
    remaining -= principalAmount;
  }

  if (remaining !== 0)
    throw new RangeError(
      'Refund principal exceeds the remaining collection balance',
    );
  return allocations;
}
