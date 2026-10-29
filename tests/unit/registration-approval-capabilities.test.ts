import { expect, it } from 'vitest';
import { roleHasCapability } from '../../lib/auth/capabilities';

it('denies Sales approval while preserving Sales payment recording', () => {
  expect(roleHasCapability('sales', 'approve_registration')).toBe(false);
  expect(roleHasCapability('sales', 'record_payment')).toBe(true);
});
