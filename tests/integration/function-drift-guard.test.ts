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
  for (const item of guardedFunctions) {
    const { identity } = item;
    const [original] = await db<{ definition: string; md5: string }[]>`
      select pg_get_functiondef(${identity}::regprocedure) as definition,
        md5(pg_get_functiondef(${identity}::regprocedure)) as md5
    `;
    expect(original?.definition).toBeTruthy();
    const mutant = original!.definition.replace(
      /\n\$function\$\s*$/,
      '\n-- simulated abandoned mutation\n$function$',
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
    const [restored] = await db<{ md5: string }[]>`
      select md5(pg_get_functiondef(${identity}::regprocedure)) as md5
    `;
    expect(restored?.md5).toBe(original?.md5);
  }
});
