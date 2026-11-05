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
  it('lists every remaining copy item awaiting approval and its exact source path', () => {
    expect(report).toContain('## Remaining copy awaiting PO approval');
    for (const item of [
      'Health notice Arabic',
      'Health notice English',
      'Remaining EN intake rows and options',
    ])
      expect(report).toContain(item);
    expect(report).toContain(
      'specs/015-forms-intake/fixtures/s14-po-decisions.json',
    );
    expect(report).toContain('S30-PO-1 Q2 approved Terms AR/EN');
    expect(report).toContain('specs/015-forms-intake/spec.md');
  });

  it('keeps remaining approval-required copy visibly draft and records approved Terms/sex copy', () => {
    expect(report).toContain('DRAFT — pending PO approval');
    expect(decisions.P1_sex.copy_status).toContain(
      'Approved verbatim by PO S30-PO-1 Q2 at 5084916',
    );
    expect(decisions.P2_health_notice.copy_status).toContain(
      'PO approval required',
    );
    expect(decisions.P3_consent.terms_copy_status).toContain(
      'Approved verbatim by PO S30-PO-1 Q2 at 5084916',
    );
    expect(spec).toContain(
      'All 68 pending English intake rows are approved, with each row ID, exact English value and `S34-PO-6` citation recorded in `fixtures/s34-approved-intake-en.json`.',
    );
    expect(report).toContain('PO-approved intake English is limited to B01');
    expect(report).toContain(
      'all remaining authored translations are pending PO review before publication.',
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
