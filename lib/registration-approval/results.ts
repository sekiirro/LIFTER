export const REGISTRATION_APPROVAL_FIELDS = [
  'workspaceId',
  'clientId',
  'requestKey',
  'expectedAmountMinor',
  'currency',
  'collectedOn',
  'paymentConfirmed',
  'reasonCode',
] as const;
export type RegistrationApprovalField =
  (typeof REGISTRATION_APPROVAL_FIELDS)[number];

export type RegistrationApprovalFailure =
  | { status: 'not_permitted' | 'stale_state' | 'key_conflict' | 'unavailable' }
  | { status: 'invalid_input'; fields: RegistrationApprovalField[] };

export function registrationApprovalResult(
  status: RegistrationApprovalFailure['status'],
  fields?: readonly string[],
): RegistrationApprovalFailure {
  if (status !== 'invalid_input') return { status };
  const allowed = new Set<string>(REGISTRATION_APPROVAL_FIELDS);
  return {
    status,
    fields: [...new Set(fields ?? [])].filter(
      (field): field is RegistrationApprovalField => allowed.has(field),
    ),
  };
}

export function mapRegistrationApprovalError(
  error: unknown,
): RegistrationApprovalFailure {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown };
    if (candidate.code === '42501') return { status: 'not_permitted' };
    if (candidate.code === '22023' && candidate.message === 'stale_state')
      return { status: 'stale_state' };
    if (candidate.code === '22023' && candidate.message === 'key_conflict')
      return { status: 'key_conflict' };
    if (candidate.code === '22023' && candidate.message === 'invalid_input')
      return registrationApprovalResult('invalid_input');
  }
  return { status: 'unavailable' };
}
