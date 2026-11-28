import { isValidMonth } from './report';

export type PointAdjustmentOperation = 'add' | 'deduct' | 'correct';
export type OriginalEntryKind = 'earned' | 'adjustment';

export type PointActionStatus =
  | 'ok'
  | 'reason_required'
  | 'invalid_input'
  | 'invalid_target'
  | 'invalid_lineage'
  | 'key_conflict'
  | 'not_permitted'
  | 'error';

export type PointActionResult = { status: PointActionStatus };

export type PointAdjustmentInput = {
  workspaceId: string;
  staffUserId: string;
  operation: PointAdjustmentOperation;
  points: string;
  effectiveMonth: string | null;
  originalEntryKind: OriginalEntryKind | null;
  originalEntryId: string | null;
  reason: string;
  idempotencyKey: string;
};

export type ReattributePointInput = {
  workspaceId: string;
  originalEntryKind: OriginalEntryKind;
  originalEntryId: string;
  targetStaffUserId: string;
  reason: string;
  idempotencyKey: string;
};

export type PostPointAdjustmentAction = (
  input: PointAdjustmentInput,
) => Promise<PointActionResult>;

export type ReattributePointAction = (
  input: ReattributePointInput,
) => Promise<PointActionResult>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unsignedPointsPattern = /^(0|[1-9][0-9]{0,7})(?:\.([0-9]{1,2}))?$/;
const signedPointsPattern = /^-?(0|[1-9][0-9]{0,7})(?:\.([0-9]{1,2}))?$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

export function isOriginalEntryKind(
  value: unknown,
): value is OriginalEntryKind {
  return value === 'earned' || value === 'adjustment';
}

export function isPointAdjustmentOperation(
  value: unknown,
): value is PointAdjustmentOperation {
  return value === 'add' || value === 'deduct' || value === 'correct';
}

export function normalizePointReason(
  value: unknown,
):
  | { status: 'ok'; reason: string }
  | { status: 'reason_required' | 'invalid_input' } {
  if (typeof value !== 'string') return { status: 'reason_required' };
  const reason = value.trim();
  if (reason.length === 0) return { status: 'reason_required' };
  if (Array.from(reason).length > 500) return { status: 'invalid_input' };
  return { status: 'ok', reason };
}

/** Canonical scale-2 text without JavaScript floating-point arithmetic. */
export function canonicalPointInput(
  value: unknown,
  operation: PointAdjustmentOperation,
): string | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  const match =
    operation === 'correct'
      ? signedPointsPattern.exec(input)
      : unsignedPointsPattern.exec(input);
  if (!match) return null;
  const magnitude = match[1]!;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  if (magnitude === '0' && /^0*$/.test(fraction)) return null;
  const canonical = `${magnitude}.${fraction}`;
  return input.startsWith('-') ? `-${canonical}` : canonical;
}

export function isValidPointMonth(value: unknown): value is string {
  return isValidMonth(value);
}
