import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261103130000_f13_review_guards_projection.sql',
  'utf8',
);
const round9 = readFileSync(
  'supabase/migrations/20261103130500_f13_reject_deactivated_client_operations.sql',
  'utf8',
);
function functionBody(name: string): string {
  const start = migration.indexOf(`function app_private.${name}`);
  if (start < 0) return '';
  const end = migration.indexOf('end $$;', start);
  return migration.slice(start, end < 0 ? undefined : end);
}

describe('F13 review corrections are forward-only and enforced in SQL', () => {
  it('rejects renewals and freezes after client deactivation', () => {
    const renewalStart = round9.indexOf('function public.record_renewal');
    const freezeStart = round9.indexOf('function app_private.f13_freeze_guard');
    expect(round9.slice(renewalStart, freezeStart)).toMatch(
      /c\.deactivated_at is not null[\s\S]*?return jsonb_build_object\('status','stale_state'\)/,
    );
    expect(round9.slice(freezeStart)).toMatch(
      /client_deactivated_at is not null[\s\S]*?raise exception 'invalid_freeze_actor_or_state'/,
    );
  });
  it('blocks Apply and lifecycle events after a refund', () => {
    expect(functionBody('f13_freeze_guard')).toMatch(
      /public\.refund_operations/,
    );
    expect(functionBody('f13_freeze_event_guard')).toMatch(
      /public\.refund_operations/,
    );
  });

  it('floors removed freeze projection from the Remove recording timestamp', () => {
    expect(migration).toMatch(
      /max\(\(e\.recorded_at at time zone 'Africa\/Cairo'\)::date\+1\)[\s\S]*?e\.kind='remove'/,
    );
    expect(migration).toMatch(/own_end:=greatest\(own_end,remove_floor\)/);
  });

  it('rejects changing a renewal start after its Cairo service date began', () => {
    expect(migration).toMatch(
      /old_start<=today_cairo and next_start is distinct from old_start/,
    );
    expect(migration).toMatch(/renewal_reflow_started/);
  });

  it('uses persisted renewal due dates and leaves initial activation dates unchanged', () => {
    expect(migration).toMatch(
      /when s\.kind='renewal' then i\.due_on[\s\S]*?when i\.seq=1 or a\.activated_at is null then null/,
    );
  });
});
