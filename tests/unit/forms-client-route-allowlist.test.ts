import { describe, expect, it } from 'vitest';
import {
  approvedAssignmentDestination,
  isApprovedClientDestination,
} from '../../lib/client-access/routes';

describe('T022 F12 approved-client route allowlist', () => {
  it('allows the existing home fallback and a canonical assignment route', () => {
    const destination = approvedAssignmentDestination(
      '3f8e89d7-7c5b-42b0-976a-7ec70f0d71f8',
    );
    expect(destination).toBe('/forms/3f8e89d7-7c5b-42b0-976a-7ec70f0d71f8');
    expect(isApprovedClientDestination('/')).toBe(true);
    expect(isApprovedClientDestination(destination)).toBe(true);
  });

  it.each([
    'https://attacker.test/forms/3f8e89d7-7c5b-42b0-976a-7ec70f0d71f8',
    '//attacker.test/forms/3f8e89d7-7c5b-42b0-976a-7ec70f0d71f8',
    '/forms/../../registration-approvals',
    '/forms/not-a-uuid',
    '/forms/3f8e89d7-7c5b-42b0-976a-7ec70f0d71f8?next=/staff',
    '/registration-approvals',
  ])('rejects unlisted destination %s', (destination) => {
    expect(isApprovedClientDestination(destination)).toBe(false);
    expect(approvedAssignmentDestination(destination)).toBeNull();
  });
});
