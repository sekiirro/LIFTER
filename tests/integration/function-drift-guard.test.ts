import { afterAll, expect, it } from 'vitest';
import {
  applyFunctionDefinition,
  checkAndRestoreFunctionDrift,
  guardedFunctions,
} from './function-drift-guard';
import { sql } from './harness';

const db = sql();
afterAll(() => db.end());

it('restores an abandoned committed function mutant from its migration and fails loudly', async () => {
  expect(guardedFunctions.map(({ identity }) => identity)).toEqual(
    expect.arrayContaining([
      'app_private.f15_alert_schedule_activate()',
      'app_private.f15_alert_schedule_deactivate()',
      'app_private.ensure_default_onboarding_form(uuid,uuid)',
    ]),
  );
  expect(
    guardedFunctions.find(
      ({ identity }) =>
        identity === 'app_private.ensure_default_onboarding_form(uuid,uuid)',
    )?.migration,
  ).toBe('20261108021000_f15_localized_n11_starter_labels.sql');
  for (const item of guardedFunctions) {
    const { identity } = item;
    const [original] = await db<{ definition: string; md5: string }[]>`
      select pg_get_functiondef(${identity}::regprocedure) as definition,
        md5(pg_get_functiondef(${identity}::regprocedure)) as md5
    `;
    expect(original?.definition).toBeTruthy();
    try {
      const mutant = original!.definition.replace(
        /(\bas\s+\$[A-Za-z_]*\$)/i,
        '$1\n-- simulated abandoned mutation',
      );
      expect(mutant).not.toBe(original!.definition);
      await applyFunctionDefinition(
        db,
        'owner' in item ? item.owner : 'postgres',
        mutant,
      );

      await expect(checkAndRestoreFunctionDrift()).rejects.toThrow(
        `F15 function drift detected and restored from migrations: ${identity}`,
      );
    } finally {
      await applyFunctionDefinition(
        db,
        'owner' in item ? item.owner : 'postgres',
        original!.definition,
      );
      const [restored] = await db<{ md5: string }[]>`
        select md5(pg_get_functiondef(${identity}::regprocedure)) as md5
      `;
      expect(restored?.md5).toBe(original?.md5);
    }
  }
});
