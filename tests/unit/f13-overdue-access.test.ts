import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  obligationDueOn,
  parseClientOverdueStatus,
  projectOverdue,
  type OverdueObligation,
} from '../../lib/subscriptions/overdue';

const migration = readFileSync(
  'supabase/migrations/20261125010000_f13_overdue_access_input.sql',
  'utf8',
);
function body(sig: string): string {
  const start = migration.indexOf(`function ${sig}`);
  return migration.slice(start, migration.indexOf('end $$;', start));
}

const base: OverdueObligation = {
  seq: 2,
  renewal: false,
  storedDueOn: null,
  issuedDayOffset: 30,
  activatedAt: '2026-11-01T10:00:00+02:00',
  paid: false,
  cancelled: false,
};

describe('F13 FR-028 overdue projection (TS mirror)', () => {
  it('derives due dates from Cairo activation plus offset; seq 1 and unactivated have none', () => {
    expect(obligationDueOn(base)).toBe('2026-12-01');
    expect(obligationDueOn({ ...base, seq: 1 })).toBeNull();
    expect(obligationDueOn({ ...base, activatedAt: null })).toBeNull();
    expect(
      obligationDueOn({ ...base, renewal: true, storedDueOn: '2026-12-09' }),
    ).toBe('2026-12-09');
  });
  it('is payable through Cairo day-end: overdue only strictly after the due date', () => {
    expect(projectOverdue([base], '2026-12-01').overdue).toBe(false);
    expect(projectOverdue([base], '2026-12-02')).toEqual({
      overdue: true,
      overdueSince: '2026-12-01',
      firstOverdueSeq: 2,
      overdueInstallmentCount: 1,
    });
  });
  it('ignores paid and cancelled obligations and never invents a due date', () => {
    const asOf = '2027-06-01';
    expect(projectOverdue([{ ...base, paid: true }], asOf).overdue).toBe(false);
    expect(projectOverdue([{ ...base, cancelled: true }], asOf).overdue).toBe(
      false,
    );
    expect(projectOverdue([{ ...base, activatedAt: null }], asOf).overdue).toBe(
      false,
    );
    expect(projectOverdue([{ ...base, seq: 1 }], asOf).overdue).toBe(false);
  });
  it('reports the earliest overdue obligation and a count', () => {
    const r = projectOverdue(
      [
        { ...base, seq: 3, issuedDayOffset: 60 },
        { ...base, seq: 2 },
      ],
      '2027-06-01',
    );
    expect(r).toMatchObject({
      firstOverdueSeq: 2,
      overdueSince: '2026-12-01',
      overdueInstallmentCount: 2,
    });
  });
  it('parses the RPC result fail-closed', () => {
    const ok = {
      status: 'ok',
      overdue: true,
      overdue_since: '2026-12-01',
      first_overdue_seq: 2,
      overdue_installment_count: 1,
      reason: 'installment_past_due',
    };
    expect(parseClientOverdueStatus(ok)).toMatchObject({
      status: 'ok',
      overdue: true,
      overdueSince: '2026-12-01',
    });
    expect(
      parseClientOverdueStatus({
        status: 'ok',
        overdue: false,
        overdue_since: null,
        first_overdue_seq: null,
        overdue_installment_count: 0,
        reason: null,
      }),
    ).toMatchObject({ status: 'ok', overdue: false });
    for (const bad of [
      null,
      'ok',
      { status: 'invalid' },
      { ...ok, overdue: 'yes' },
      { ...ok, overdue_since: null },
      { ...ok, overdue: false },
      { ...ok, overdue_installment_count: 1.5 },
    ])
      expect(parseClientOverdueStatus(bad)).toEqual({ status: 'invalid' });
  });
});

describe('F13 overdue SQL contract (static)', () => {
  it('derives only from existing facts and mirrors the F12/F13 due-date rule', () => {
    const b = body('app_private.f13_project_overdue');
    expect(b).toMatch(/public\.payment_events/);
    expect(b).toMatch(/public\.subscription_obligation_cancellations/);
    expect(b).toMatch(/'Africa\/Cairo'/);
    expect(b).toMatch(/d\.due_on < as_of/);
    expect(b).toMatch(/i\.seq = 1 or a\.activated_at is null then null/);
    expect(b).not.toMatch(/refund_operations|subscription_freezes/);
  });
  it('keeps the client wall own-account only with no caller-supplied target', () => {
    expect(migration).toMatch(
      /function public\.client_overdue_status\(\)\s*returns jsonb/,
    );
    const b = body('public.client_overdue_status()');
    expect(b).toMatch(/c\.auth_user_id = auth\.uid\(\)/);
    expect(b).toMatch(/approval_state = 'approved'/);
    expect(b).toMatch(/deactivated_at is null/);
    expect(migration).toMatch(
      /grant execute on function public\.client_overdue_status\(\) to authenticated/,
    );
    expect(migration).not.toMatch(/grant execute[^;]*\banon\b/i);
  });
  it('is tenant-scoped, security definer with an empty search path and adds no tables', () => {
    expect(migration).not.toMatch(/create table|alter table/i);
    expect(
      migration.match(/security definer set search_path = ''/g),
    ).toHaveLength(3);
    expect(body('app_private.f13_client_overdue_state')).toMatch(
      /c\.workspace_id = ws and c\.id = cid/,
    );
  });
});
