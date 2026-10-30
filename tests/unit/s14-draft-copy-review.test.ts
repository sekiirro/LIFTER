import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const report = readFileSync(
  resolve(root, 'specs/015-forms-intake/reports/S14-terms-draft.md'),
  'utf8',
);
const decisions = JSON.parse(
  readFileSync(
    resolve(root, 'specs/015-forms-intake/fixtures/s14-po-decisions.json'),
    'utf8',
  ),
);
const spec = readFileSync(
  resolve(root, 'specs/015-forms-intake/spec.md'),
  'utf8',
);

describe('S14 draft-copy PO review package', () => {
  it('lists every copy item awaiting approval and its exact source path', () => {
    expect(report).toContain('## Awaiting PO approval');
    for (const item of [
      'T&C Arabic',
      'T&C English',
      'Health notice Arabic',
      'Health notice English',
      'Sex question and labels Arabic',
      'Sex question and labels English',
      'EN intake translations',
    ])
      expect(report).toContain(item);
    expect(report).toContain(
      'specs/015-forms-intake/reports/S14-terms-draft.md',
    );
    expect(report).toContain(
      'specs/015-forms-intake/fixtures/s14-po-decisions.json',
    );
    expect(report).toContain('specs/015-forms-intake/spec.md');
  });

  it('keeps all approval-required copy visibly draft', () => {
    expect(report).toContain('DRAFT — pending PO approval');
    expect(decisions.P1_sex.copy_status).toContain('DRAFT COPY');
    expect(decisions.P2_health_notice.copy_status).toContain(
      'PO approval required',
    );
    expect(decisions.P3_consent.terms_copy_status).toContain('DRAFT');
    expect(spec).toContain('Each is pending PO review before publication.');
    expect(spec).toContain(
      'All EN translations in this table remain pending PO review.',
    );
  });

  it('keeps the historical S14 health notice informational, with standalone UI superseded', () => {
    expect(decisions.P2_health_notice.position).toBe(
      'immediately before health questions',
    );
    expect(decisions.P2_health_notice.acknowledgment_checkbox).toBe(false);
    expect(decisions.P2_health_notice.consent_record).toBe(false);
    expect(report).toContain('no acknowledgment checkbox or consent record');
    expect(spec).toContain('There is no standalone health notice');
  });
});
