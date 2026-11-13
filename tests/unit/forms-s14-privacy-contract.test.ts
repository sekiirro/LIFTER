import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const contract = readFileSync(
  resolve(root, 'specs/015-forms-intake/contracts/retention-and-alerts.md'),
  'utf8',
);
const model = readFileSync(
  resolve(root, 'specs/015-forms-intake/data-model.md'),
  'utf8',
);
const cases = JSON.parse(
  readFileSync(
    resolve(root, 'tests/fixtures/forms/s14-privacy-cases.json'),
    'utf8',
  ),
);

describe('S14 sex-answer privacy and retention contract', () => {
  it('classifies sex as personal data for N12 series selection only', () => {
    expect(cases.classification).toBe('personal data');
    expect(cases.allowedPurpose).toBe(
      'select the standard N12 reference series',
    );
    expect(cases.forbiddenSeries).toContain('male-cinematic');
    expect(contract).toContain(
      'personal data used only to select the standard N12 reference series',
    );
    expect(model).toMatch(/SexAnswer[\s\S]*?personal data[\s\S]*?N12/);
  });

  it('excludes sex values from logs and audit payloads', () => {
    expect(cases.valueFieldsExcludedFrom).toEqual(['logs', 'audit payloads']);
    expect(contract).toContain(
      'Never place the sex value in logs or audit payloads.',
    );
    expect(model).toMatch(
      /SexAnswer[\s\S]*?not logged or included in audit payloads/,
    );
  });

  it('uses the approved authorization and all-copy retention lifecycle', () => {
    expect(cases.retentionDays).toBe(30);
    expect(cases.retentionStartsAt).toEqual([
      'Closure',
      'Refund',
      'Deactivation',
    ]);
    expect(cases.accessControl).toBe(
      'same as related sensitive intake profile',
    );
    expect(contract).toContain(
      'authorization, no-store, audit-redaction, retention, and erasure controls',
    );
    expect(contract).toContain(
      'all-copy deletion within the approved 30-day window',
    );
    expect(contract).toContain('sensitive intake profile');
  });
});
