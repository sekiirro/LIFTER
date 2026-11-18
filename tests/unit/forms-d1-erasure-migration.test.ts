import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = path.resolve('supabase/migrations');

function findD1Migration(): string | undefined {
  return readdirSync(migrationsDir).find((name) =>
    /^2026113003\d{4}_f15_d1_privacy_erasure\.sql$/.test(name),
  );
}

describe('T029 D1 privacy erasure migration contract', () => {
  it('provides a forward-only D1 migration in the reserved 2026113003xxxx range without BOM or scheduler activation', () => {
    const filename = findD1Migration();
    expect(filename).toBeDefined();
    const filePath = path.join(migrationsDir, filename!);
    expect(existsSync(filePath)).toBe(true);

    const raw = readFileSync(filePath);
    expect(raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(
      false,
    );

    const sql = raw.toString('utf8');
    expect(sql).toMatch(
      /create or replace function app_private\.audit_events_immutable\(\)/i,
    );
    expect(sql).toMatch(
      /create or replace function app_private\.guard_form_answer_revision_immutable\(\)/i,
    );
    expect(sql).toMatch(
      /create or replace function app_private\.guard_form_draft_after_submission\(\)/i,
    );
    expect(sql).toMatch(
      /create function app_private\.d1_erase_inapplicable_answers\(/i,
    );
    expect(sql).toMatch(
      /create table app_private\.form_d1_erasure_controls\b/i,
    );
    expect(sql).toMatch(
      /create table app_private\.form_d1_erasure_hold_alerts\b/i,
    );
    expect(sql).toMatch(/create table app_private\.f15_d1_erasure_context\b/i);
    expect(sql).not.toMatch(/grant\s+delete\s+on\s+(?:public\.)?audit_events/i);
    expect(sql).not.toMatch(
      /create\s+policy[\s\S]*on\s+(?:public\.)?audit_events\s+for\s+delete/i,
    );
    expect(sql).not.toMatch(
      /^\s*perform\s+app_private\.f15_d1_erasure_schedule_activate\(\)/im,
    );
    expect(sql).not.toMatch(
      /grant\s+execute[\s\S]*d1_erase_inapplicable_answers[\s\S]*to\s+(?:public|anon|authenticated|service_role)/i,
    );
  });

  it('pins postgres ownership, empty search_path, and revocations on all new D1 functions', () => {
    const filename = findD1Migration();
    expect(filename).toBeDefined();
    const sql = readFileSync(path.join(migrationsDir, filename!), 'utf8');

    for (const signature of [
      'app_private.audit_events_immutable()',
      'app_private.guard_form_answer_revision_immutable()',
      'app_private.guard_form_draft_after_submission()',
      'app_private.guard_form_d1_erasure_control()',
      'app_private.d1_erase_inapplicable_answers(uuid,uuid)',
      'app_private.f15_d1_erasure_run_batch(integer)',
      'app_private.f15_d1_erasure_run()',
      'app_private.f15_d1_erasure_schedule_deactivate()',
      'app_private.f15_d1_erasure_schedule_activate()',
    ]) {
      const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(sql).toMatch(
        new RegExp(`alter function ${escaped} owner to postgres`, 'i'),
      );
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function ${escaped}[\\s\\S]*?from public,\\s*anon,\\s*authenticated,\\s*service_role`,
          'i',
        ),
      );
    }

    expect(sql).toMatch(/set search_path = ''/i);
  });
});
