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
  it('marks all P1/P2/P3 and EN intake copy as pending PO review', () => {
    expect(decisions.P1_sex.copy_status).toContain('DRAFT');
    expect(decisions.P2_health_notice.copy_status).toContain(
      'PO approval required',
    );
    expect(decisions.P3_consent.terms_copy_status).toContain(
      'PO approval required',
    );
    expect(decisions.P3_consent.terms_card).toContain('post-Nutrition');
    expect(decisions.P3_consent.marketing).toContain('separate optional');
    expect(spec).toContain('Each is pending PO review before publication.');
    expect(spec).toContain(
      'All EN translations in this table remain pending PO review.',
    );
    expect(cases.pendingCopy).toEqual([
      'P1_sex',
      'P2_health_notice',
      'P3_terms',
      'EN_intake_translations',
    ]);
  });

  it('records the health notice before health questions without consent', () => {
    expect(decisions.P2_health_notice.position).toBe(
      'immediately before health questions',
    );
    expect(decisions.P2_health_notice.acknowledgment_checkbox).toBe(false);
    expect(decisions.P2_health_notice.consent_record).toBe(false);
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

  it('matches the 26 parent IDs and keeps N12 last', () => {
    expect(cases.parentIds).toHaveLength(26);
    for (const id of cases.parentIds)
      expect(spec).toMatch(new RegExp(`\\| ${id} \\|`));
    expect(cases.parentIds).toEqual([
      'B01',
      'B02',
      'B03',
      'B04',
      'B05',
      'B06',
      'T01',
      'T02',
      'T03',
      'T04',
      'T05',
      'T06',
      'T07',
      'T08',
      'N01',
      'N02',
      'N03',
      'N04',
      'N05',
      'N06',
      'N07',
      'N08',
      'N09',
      'N10',
      'N11',
      'N12',
    ]);
    expect(spec.indexOf('| N12 | Nutrition 12, last')).toBeGreaterThan(
      spec.indexOf('| N11 | Nutrition 11'),
    );
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
