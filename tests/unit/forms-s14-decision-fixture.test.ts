import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const decisions = JSON.parse(
  readFileSync(
    resolve(root, 'specs/015-forms-intake/fixtures/s14-po-decisions.json'),
    'utf8',
  ),
);
const cases = JSON.parse(
  readFileSync(
    resolve(root, 'tests/fixtures/forms/s14-po-decision-cases.json'),
    'utf8',
  ),
);
const spec = readFileSync(
  resolve(root, 'specs/015-forms-intake/spec.md'),
  'utf8',
);

describe('S14 PO decision fixture', () => {
  it('keeps draft copy and only unapproved EN intake rows pending PO review', () => {
    expect(decisions.P1_sex.copy_status).toContain(
      'Approved verbatim by PO S30-PO-1 Q2 at 5084916',
    );
    expect(decisions.P2_health_notice.copy_status).toContain(
      'PO approval required',
    );
    expect(decisions.P3_consent.terms_copy_status).toContain(
      'Approved verbatim by PO S30-PO-1 Q2 at 5084916',
    );
    expect(decisions.P3_consent.terms_card).toContain('post-Nutrition');
    expect(decisions.P3_consent.marketing).toContain('separate optional');
    expect(spec).toMatch(
      /(?:S34-PO-6.*approve all 68|All 68 pending English intake rows are approved)/s,
    );
    expect(spec).toContain('| B01 | Full name (three parts) |');
    expect(spec).toContain('| B06 | Gender |');
    expect(spec).toContain('| T08 | Training split |');
    expect(spec).toContain('| N08 | What’s your food budget? |');
    expect(spec).toContain(
      '| N07.training_timing | After which meal would you like to train? |',
    );
    expect(spec).toContain('| B02 | Age |');
    expect(spec).toContain(
      '| N01 | What is your goal for your nutrition plan? |',
    );
    expect(cases.pendingCopy).toEqual(['P2_health_notice']);
    expect(cases.approvedENRows).toEqual([
      'B01',
      'B06',
      'T03.2',
      'T03.3',
      'T03.4',
      'T03.5',
      'T03.6',
      'T08',
      'N07.training_timing',
      'N08',
    ]);
    expect(cases.pendingENRows).toContain('N08.low.foods');
    expect(cases.pendingENRows).toContain('N11.feedback.0_2');
  });

  it('keeps historical S14 health-notice fixture separate from S17 product UI', () => {
    expect(decisions.P2_health_notice.position).toBe(
      'immediately before health questions',
    );
    expect(decisions.P2_health_notice.acknowledgment_checkbox).toBe(false);
    expect(decisions.P2_health_notice.consent_record).toBe(false);
    expect(spec).toContain('There is no standalone health notice');
    expect(spec).toContain('only where genuinely useful');
  });

  it('keeps the PO-approved P4 meal variation separate from canonical Arabic', () => {
    expect(decisions.P4_meals.status).toContain('PO-approved deviation');
    expect(decisions.P4_meals.canonical_file_unchanged).toBe(true);
    expect(decisions.P4_meals.max_meals).toBe(5);
    expect(decisions.P4_meals.ar_options).toEqual([
      'وجبتين',
      '3 وجبات',
      '4 وجبات',
      '5 وجبات',
    ]);
  });

  it('keeps PO source metadata portable and free of machine-local paths', () => {
    expect(decisions.S33_PO_3.source).toBe(
      's28-po-decisions-verbatim brief, 2026-11-04',
    );
    expect(decisions.S33_PO_3.source).not.toMatch(
      /(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/u,
    );
  });

  it('treats prior S14 questions as optional editable starter material', () => {
    expect(spec).toContain(
      'Previously supplied S14 questions are editable starter content, not a fixed catalog.',
    );
    expect(spec).toMatch(
      /Your First Step \(.+\) is the default ordinary editable onboarding form in Forms\./,
    );
    expect(spec).not.toContain('all 26 parent questions are required');
  });

  it('maps sex only to standard image series', () => {
    expect(decisions.P1_sex.series).toEqual({
      male: 'male',
      female: 'female',
      'male-cinematic': 'unused',
    });
    expect(cases.sexSeries).toEqual(decisions.P1_sex.series);
    expect(spec).toContain(
      'Male selects the standard `male` series; female selects `female`; `male-cinematic` is unused.',
    );
  });
});
