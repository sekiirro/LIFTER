import { afterAll, describe, expect, it } from 'vitest';
import { sql } from './harness';

const db = sql();
const immutableTables = [
  'public.p7_earned_points',
  'public.p7_salary_revisions',
  'public.p7_monetary_payroll_inputs',
  'public.p7_payroll_snapshots',
  'public.p7_payroll_approvals',
  'app_private.workforce_checkin_transitions',
];

afterAll(async () => {
  await db.end();
});

describe('P7 immutable truncate guards (S70-R113)', () => {
  it.each(immutableTables)(
    'rejects privileged TRUNCATE of %s',
    async (table) => {
      await expect(
        db.begin(async (tx) => {
          await tx`truncate table ${tx(table)} cascade`;
          throw new Error('truncate unexpectedly succeeded');
        }),
      ).rejects.toMatchObject({
        code: '23514',
        message: expect.stringMatching(/immutable|append-only/i),
      });
    },
  );

  it('kill test: removing the earned-points truncate trigger permits the mutation', async () => {
    await db
      .begin(async (tx) => {
        await tx`drop trigger p7_earned_points_no_truncate on public.p7_earned_points`;
        await tx`truncate table public.p7_earned_points cascade`;
        // The transaction rollback restores the trigger and all rows.
        throw new Error('rollback mutation transaction');
      })
      .catch((error: { message?: string }) => {
        expect(error.message).toBe('rollback mutation transaction');
      });
  });
});
