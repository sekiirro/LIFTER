import { parseMinorUnits } from './money';

export type ApprovalInput = {
  workspaceId: string;
  clientId: string;
  requestKey: string;
  expectedAmountMinor: string;
  currency: string;
  collectedOn: string;
  paymentConfirmed: true;
};

export type RejectionInput = {
  workspaceId: string;
  clientId: string;
  requestKey: string;
  reasonCode: 'registration_rejected';
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPROVAL_KEYS = [
  'workspaceId',
  'clientId',
  'requestKey',
  'expectedAmountMinor',
  'currency',
  'collectedOn',
  'paymentConfirmed',
] as const;
const REJECTION_KEYS = [
  'workspaceId',
  'clientId',
  'requestKey',
  'reasonCode',
] as const;

function exactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year! % 4 === 0 && (year! % 100 !== 0 || year! % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year! >= 1 &&
    month! >= 1 &&
    month! <= 12 &&
    day! >= 1 &&
    day! <= days[month! - 1]!
  );
}

type IdentifiedInput = {
  workspaceId: string;
  clientId: string;
  requestKey: string;
};

function validIds(
  value: Record<string, unknown>,
): value is Record<string, unknown> & IdentifiedInput {
  return (
    typeof value.workspaceId === 'string' &&
    UUID.test(value.workspaceId) &&
    typeof value.clientId === 'string' &&
    UUID.test(value.clientId) &&
    typeof value.requestKey === 'string' &&
    UUID.test(value.requestKey)
  );
}

export function parseApprovalInput(value: unknown): ApprovalInput | null {
  if (!exactKeys(value, APPROVAL_KEYS) || !validIds(value)) return null;
  const expectedAmountMinor = parseMinorUnits(value.expectedAmountMinor);
  if (
    expectedAmountMinor === null ||
    typeof value.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !validDate(value.collectedOn) ||
    value.paymentConfirmed !== true
  )
    return null;

  return {
    workspaceId: value.workspaceId,
    clientId: value.clientId,
    requestKey: value.requestKey,
    expectedAmountMinor,
    currency: value.currency,
    collectedOn: value.collectedOn,
    paymentConfirmed: true,
  };
}

export function parseRejectionInput(value: unknown): RejectionInput | null {
  if (
    !exactKeys(value, REJECTION_KEYS) ||
    !validIds(value) ||
    value.reasonCode !== 'registration_rejected'
  )
    return null;

  return {
    workspaceId: value.workspaceId,
    clientId: value.clientId,
    requestKey: value.requestKey,
    reasonCode: 'registration_rejected',
  };
}
