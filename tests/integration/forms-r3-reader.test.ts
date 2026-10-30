import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const db = postgres(process.env.DB_URL ?? '', { max: 1, connect_timeout: 10 });
afterAll(() => db.end());

function hasAuditBeforeAnswer(body: string) {
  const audit = body.indexOf('insert into public.audit_events');
  const answer = body.lastIndexOf('return answer_result');
  return audit >= 0 && answer > audit;
}

describe('T004 single audited answer reader', () => {
  it('routes current, draft, and history through the single mode-aware reader', async () => {
    const [reader] = await db`
      select p.prosrc as body, pg_catalog.pg_get_function_arguments(p.oid) as args
      from pg_catalog.pg_proc p
      where p.oid=to_regprocedure('public.read_form_answer(uuid,uuid,text)')
    `;

    expect(reader).toBeDefined();
    if (!reader) throw new Error('mode-aware audited reader is missing');
    expect(reader.args).toContain('p_view text');
    expect(reader.body).toMatch(/current|latest/iu);
    expect(reader.body).toContain('form_answer_drafts');
    expect(reader.body).toContain('form_answer_revisions');
    expect(reader.body).toContain('form.answer_viewed');
    const audit = reader.body.indexOf('insert into public.audit_events');
    const dataReturn = reader.body.lastIndexOf('return answer_result');
    expect(hasAuditBeforeAnswer(reader.body)).toBe(true);
    expect(dataReturn).toBeGreaterThan(audit);
    expect(reader.body.slice(audit, dataReturn)).not.toMatch(
      /answer_values|answer_result/iu,
    );

    const mutant = reader.body.replace(
      /insert into public\.audit_events[\s\S]*?\);\s*/u,
      '',
    );
    expect(hasAuditBeforeAnswer(mutant)).toBe(false);
  });
});
