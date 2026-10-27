import { afterAll, expect, it } from 'vitest';
import {
  CAPABILITIES,
  ROLES,
  roleHasCapability,
} from '../../lib/auth/capabilities';
import { sql } from './harness';

const db = sql();
afterAll(async () => {
  await db.end();
});

for (const role of ROLES) {
  for (const capability of [...CAPABILITIES, 'unknown', 'toString']) {
    it(`T010 parity: ${role} / ${capability}`, async () => {
      const [row] =
        await db`select app_private.role_has_capability(${role}::public.staff_role, ${capability}) as allowed`;
      expect(row?.allowed).toBe(roleHasCapability(role, capability));
    });
  }
}

it('null role denies every known capability', async () => {
  for (const capability of CAPABILITIES) {
    const [row] =
      await db`select app_private.role_has_capability(null::public.staff_role, ${capability}) as allowed`;
    expect(row?.allowed).toBe(false);
  }
});
