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
    expect(report).toContain('S41-PO-3 approves N08.low.foods byte-exact');
    expect(report).toContain(
      'N08.medium.foods and N08.high.foods remain pending PO approval',
    );
    expect(report).toContain('S34-PO-4, S34-PO-6, and PD-S34-NEW-01');
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
      'S34-PO-6 and PD-S34-NEW-01 approve all 68 remaining pending English intake rows recorded in',
    );
    expect(report).toContain(
      'The low-budget English label is recorded in the spec and decision fixture.',
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
