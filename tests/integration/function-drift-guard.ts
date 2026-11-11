import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { loadEnv } from './harness';

export const guardedFunctions = [
  {
    identity: 'app_private.f15_answer_values_valid(jsonb,jsonb)',
    migration: '20261111024828_f15_direct_rpc_answer_validation.sql',
    name: 'app_private.f15_answer_values_valid',
  },
  {
    identity: 'public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text)',
    migration: '20261111061000_f15_correction_required_answer_guard.sql',
    name: 'public.correct_form_answer',
  },
  {
    identity: 'public.save_form_draft(uuid,uuid,integer,uuid,jsonb)',
    migration: '20261111024828_f15_direct_rpc_answer_validation.sql',
    name: 'public.save_form_draft',
  },
  {
    identity: 'public.submit_form_assignment(uuid,uuid,integer,uuid)',
    migration: '20261111024828_f15_direct_rpc_answer_validation.sql',
    name: 'public.submit_form_assignment',
  },
  {
    identity: 'public.read_form_assignment_context(uuid)',
    migration: '20261111024828_f15_direct_rpc_answer_validation.sql',
    name: 'public.read_form_assignment_context',
  },
  {
    identity: 'app_private.f15_valid_builder_definition(jsonb,boolean)',
    migration: [
      '20261108230110_f15_builder_slider_validation_guard_localized.sql',
      '20261108230109_f15_builder_slider_validation_guard.sql',
      '20261108020200_f15_localized_slider_labels.sql',
    ],
    name: 'app_private.f15_valid_builder_definition',
  },
  {
    identity: 'app_private.f15_valid_slider_label(jsonb)',
    migration: '20261109220000_f15_review16_followup.sql',
    name: 'app_private.f15_valid_slider_label',
  },
  {
    identity: 'app_private.ensure_default_onboarding_form(uuid,uuid)',
    migration: [
      '20261108021000_f15_localized_n11_starter_labels.sql',
      '20261108230018_f15_default_provisioning_configuration.sql',
    ],
    name: 'app_private.ensure_default_onboarding_form',
  },
  {
    identity:
      'app_private.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,uuid,text)',
    migration: '20261109220000_f15_review16_followup.sql',
    name: 'app_private.save_workspace_form_draft',
  },
  {
    identity:
      'public.configure_intake_assignment_policy(uuid,uuid,integer,text,uuid[],text,jsonb,jsonb)',
    migration: '20261109210000_f15_review16_forward_fixes.sql',
    name: 'public.configure_intake_assignment_policy',
  },
  {
    identity:
      'app_private.materialize_intake_assignment_occurrence_core(uuid,uuid,text,date)',
    migration: '20261108230057_f15_active_client_initial_occurrences.sql',
    name: 'app_private.materialize_intake_assignment_occurrence_core',
  },
  {
    identity: 'app_private.reconcile_f15_form_assignment(uuid,uuid)',
    migration: '20261110010000_f15_po12_decisions.sql',
    name: 'app_private.reconcile_f15_form_assignment',
  },
  {
    identity:
      'app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer)',
    migration: '20261110010000_f15_po12_decisions.sql',
    name: 'app_private.evaluate_forms_alerts_core',
  },
  {
    identity: 'app_private.f15_client_alert_lifecycle_active(uuid,uuid)',
    migration: '20261109220000_f15_review16_followup.sql',
    name: 'app_private.f15_client_alert_lifecycle_active',
  },
  {
    identity: 'app_private.cancel_f15_client_alerts(uuid,uuid)',
    migration: '20261108230104_f15_cancel_alerts_after_lifecycle_end.sql',
    name: 'app_private.cancel_f15_client_alerts',
  },
  {
    identity: 'app_private.f15_alert_schedule_immutable()',
    migration: '20261108230029_f15_alert_schedules.sql',
    name: 'app_private.f15_alert_schedule_immutable',
  },
  {
    identity: 'app_private.f15_alert_schedule_activate()',
    migration: '20261108230029_f15_alert_schedules.sql',
    name: 'app_private.f15_alert_schedule_activate',
  },
  {
    identity: 'app_private.f15_alert_schedule_deactivate()',
    migration: '20261108230029_f15_alert_schedules.sql',
    name: 'app_private.f15_alert_schedule_deactivate',
  },
  {
    identity: 'app_private.branding_publish(uuid,bigint)',
    migration: '20261102152000_branding_shared_asset_retention.sql',
    name: 'app_private.branding_publish',
    owner: 'branding_definer',
  },
  {
    identity: 'app_private.branding_asset_attach(uuid,bigint)',
    migration: '20261107032002_branding_function_convergence.sql',
    name: 'app_private.branding_asset_attach',
    owner: 'branding_definer',
  },
  {
    identity: 'app_private.branding_gc_finalize(uuid)',
    migration: '20261107032002_branding_function_convergence.sql',
    name: 'app_private.branding_gc_finalize',
    owner: 'branding_definer',
  },
] as const;

/** Install a committed mutant, execute its regression probe, then restore and verify in finally. */
export async function withCrashSafeFunctionMutant(
  identity: string,
  mutate: (definition: string) => string,
  body: () => Promise<void>,
) {
  const { dbUrl } = loadEnv();
  const db = postgres(dbUrl, { max: 1, connect_timeout: 10 });
  const [original] = await db<{ definition: string; md5: string }[]>`
    select pg_catalog.pg_get_functiondef(${identity}::regprocedure) as definition,
      md5(pg_catalog.pg_get_functiondef(${identity}::regprocedure)) as md5`;
  if (!original) {
    await db.end();
    throw new Error(`Missing function ${identity}`);
  }
  const mutant = mutate(original.definition);
  if (!mutant || mutant === original.definition) {
    await db.end();
    throw new Error(`Mutation did not change ${identity}`);
  }
  let probeError: unknown;
  let restoreError: unknown;
  let closeError: unknown;
  try {
    await db.unsafe(mutant);
    await body();
  } catch (error) {
    probeError = error;
  }
  try {
    await db.unsafe(original.definition);
    const [restored] = await db<{ md5: string }[]>`
      select md5(pg_catalog.pg_get_functiondef(${identity}::regprocedure)) as md5`;
    if (restored?.md5 !== original.md5)
      throw new Error(`Mutation restore MD5 mismatch for ${identity}`);
  } catch (error) {
    restoreError = error;
  }
  try {
    await db.end();
  } catch (error) {
    closeError = error;
  }
  const errors: unknown[] = [];
  if (probeError !== undefined) errors.push(probeError);
  if (restoreError !== undefined) errors.push(restoreError);
  if (closeError !== undefined) errors.push(closeError);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      `Mutation probe cleanup failed for ${identity}`,
    );
}

function hash(value: string) {
  return createHash('md5').update(value).digest('hex');
}

async function migrationDefinition(
  migration: (typeof guardedFunctions)[number]['migration'],
  name: string,
) {
  const migrations: readonly string[] =
    typeof migration === 'string' ? [migration] : migration;
  let sql: string | undefined;
  for (const candidate of migrations) {
    try {
      sql = await readFile(`supabase/migrations/${candidate}`, 'utf8');
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (!sql) throw new Error(`missing migration source for ${name}`);
  const escapedName = name.replaceAll('.', '\\.');
  const expression = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+${escapedName}\\s*\\([\\s\\S]*?\\)\\s*[\\s\\S]*?\\bas\\s+(\\$[a-z_0-9]*\\$)([\\s\\S]*?)\\1\\s*;`,
    'gi',
  );
  const matches = [...sql.matchAll(expression)];
  const definition = matches.at(-1)?.[0];
  if (!definition) throw new Error(`missing migration function ${name}`);
  const body = matches.at(-1)?.[2];
  if (body === undefined) throw new Error(`missing migration body ${name}`);
  return {
    definition: definition.replace(
      /^create\s+function\s+/i,
      'create or replace function ',
    ),
    bodyHash: hash(body),
  };
}

export async function applyFunctionDefinition(
  db: postgres.Sql,
  owner: string,
  definition: string,
) {
  if (owner !== 'branding_definer') {
    await db.unsafe(definition);
    return;
  }
  await db`grant create on schema app_private to branding_definer`;
  await db`grant branding_definer to postgres`;
  try {
    await db.begin(async (tx) => {
      await tx`set local role branding_definer`;
      await tx.unsafe(definition);
    });
  } finally {
    await db`revoke branding_definer from postgres`;
    await db`revoke create on schema app_private from branding_definer`;
  }
}

export async function checkAndRestoreFunctionDrift() {
  const { dbUrl } = loadEnv();
  const db = postgres(dbUrl, { max: 1, connect_timeout: 10 });
  const drift: string[] = [];
  try {
    for (const item of guardedFunctions) {
      const expected = await migrationDefinition(item.migration, item.name);
      const [actual] = await db<{ body_hash: string; definition: string }[]>`
        select md5(p.prosrc) as body_hash,
          pg_get_functiondef(p.oid) as definition
        from pg_proc p where p.oid = ${item.identity}::regprocedure
      `;
      if (!actual) throw new Error(`missing guarded function ${item.identity}`);
      if (actual.body_hash === expected.bodyHash) continue;
      drift.push(item.identity);
      await applyFunctionDefinition(
        db,
        'owner' in item ? item.owner : 'postgres',
        expected.definition,
      );
      const [restored] = await db<{ body_hash: string }[]>`
        select md5(p.prosrc) as body_hash
        from pg_proc p where p.oid = ${item.identity}::regprocedure
      `;
      if (restored?.body_hash !== expected.bodyHash)
        throw new Error(
          `failed restoring migration definition for ${item.identity}`,
        );
    }
  } finally {
    await db.end();
  }
  if (drift.length)
    throw new Error(
      `F15 function drift detected and restored from migrations: ${drift.join(', ')}`,
    );
}

export default async function functionDriftGuard() {
  await checkAndRestoreFunctionDrift();
  return async () => checkAndRestoreFunctionDrift();
}
