import { describe, expect, it } from 'vitest';
import {
  parseApprovalInput,
  parseRejectionInput,
} from '../../lib/registration-approval/validation';
import {
  mapRegistrationApprovalError,
  registrationApprovalResult,
} from '../../lib/registration-approval/results';

const validApproval = {
  workspaceId: '00000000-0000-0000-0000-000000000001',
  clientId: '00000000-0000-0000-0000-000000000002',
  requestKey: '00000000-0000-0000-0000-000000000003',
  expectedAmountMinor: '9007199254740993',
  currency: 'USD',
  collectedOn: '2026-10-29',
  paymentConfirmed: true,
};

describe('registration approval request validation', () => {
  it('accepts only the exact approval contract and preserves money as a string', () => {
    expect(parseApprovalInput(validApproval)).toEqual(validApproval);
    expect(
      parseApprovalInput({
        ...validApproval,
        expectedAmountMinor: 9007199254740992,
      }),
    ).toBeNull();
  });

  it.each([
    { paymentMethod: 'cash' },
    { reference: 'receipt 123' },
    { actorUserId: validApproval.clientId },
    { responsibleStaffId: validApproval.clientId },
    { recordedAt: '2026-10-29T10:00:00Z' },
    { effectiveOn: '2026-10-01' },
  ])('rejects uncontracted override fields %#', (extra) => {
    expect(parseApprovalInput({ ...validApproval, ...extra })).toBeNull();
  });

  it.each(['0', '-1', '1.2', '1e3', '9223372036854775808', 1200, null])(
    'rejects invalid money shape %#',
    (expectedAmountMinor) => {
      expect(
        parseApprovalInput({ ...validApproval, expectedAmountMinor }),
      ).toBeNull();
    },
  );

  it.each(['2026-02-30', '2026-2-03', 'not-a-date', ''])(
    'rejects invalid collection date %s',
    (collectedOn) => {
      expect(parseApprovalInput({ ...validApproval, collectedOn })).toBeNull();
    },
  );

  it('requires explicit payment confirmation', () => {
    expect(
      parseApprovalInput({ ...validApproval, paymentConfirmed: false }),
    ).toBeNull();
    expect(
      parseApprovalInput({ ...validApproval, paymentConfirmed: undefined }),
    ).toBeNull();
  });

  it('accepts only the single generic rejection code and rejects free text', () => {
    const input = {
      workspaceId: validApproval.workspaceId,
      clientId: validApproval.clientId,
      requestKey: validApproval.requestKey,
      reasonCode: 'registration_rejected',
    };
    expect(parseRejectionInput(input)).toEqual(input);
    expect(
      parseRejectionInput({ ...input, reason: 'private details' }),
    ).toBeNull();
    expect(
      parseRejectionInput({ ...input, reasonCode: 'duplicate_account' }),
    ).toBeNull();
  });
});

describe('registration approval safe results', () => {
  it('returns only the public failure code and allowed field names', () => {
    expect(
      registrationApprovalResult('invalid_input', ['expectedAmountMinor']),
    ).toEqual({
      status: 'invalid_input',
      fields: ['expectedAmountMinor'],
    });
    expect(
      registrationApprovalResult('invalid_input', ['secret', 'secret']),
    ).toEqual({
      status: 'invalid_input',
      fields: [],
    });
  });

  it.each([
    [{ code: '42501', message: 'private workspace data' }, 'not_permitted'],
    [{ code: '22023', message: 'stale_state' }, 'stale_state'],
    [{ code: '22023', message: 'key_conflict' }, 'key_conflict'],
    [{ code: '23514', message: 'contains PII' }, 'unavailable'],
    [new Error('secret'), 'unavailable'],
  ] as const)('maps backend detail to a safe result %#', (error, status) => {
    expect(mapRegistrationApprovalError(error)).toEqual({ status });
    expect(JSON.stringify(mapRegistrationApprovalError(error))).not.toMatch(
      /private|PII|secret/,
    );
  });
});
