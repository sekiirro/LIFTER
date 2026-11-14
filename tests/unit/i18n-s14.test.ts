import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const sharedKeys = [
  'clientSignup.dateOfBirth',
  'clientSignup.username',
  'clientSignup.telegramUsername',
  'clientSignup.optional',
  'forms.termsCardTitle',
  'forms.healthDataNoticeTitle',
  'forms.copyDraft',
] as const;

describe('T039 session-14 shared copy', () => {
  it('keeps the signup and later consent/health chrome in both locales', () => {
    for (const key of sharedKeys) {
      expect(ar[key].trim().length).toBeGreaterThan(0);
      expect(en[key].trim().length).toBeGreaterThan(0);
      expect(ar[key]).not.toBe(en[key]);
    }
  });

  it('uses the canonical Arabic full-name label byte-for-byte', () => {
    const canonical = readFileSync(
      resolve(
        process.cwd(),
        'specs/015-forms-intake/fixtures/mandatory-intake-copy-ar.md',
      ),
      'utf8',
    );
    const fullNameLabel = canonical.match(/^1\. (.+)$/mu)?.[1];
    expect(fullNameLabel).toBeTruthy();
    expect(ar['clientSignup.name']).toBe(fullNameLabel);
  });

  it('labels Terms and health chrome as draft without embedding draft policy text', () => {
    expect(ar['forms.copyDraft']).toBeTruthy();
    expect(en['forms.copyDraft']).toBeTruthy();
    expect(ar['forms.copyDraft']).not.toBe(en['forms.copyDraft']);
    expect(en['forms.termsCardTitle']).not.toMatch(/approved/i);
    expect(en['forms.healthDataNoticeTitle']).not.toMatch(/consent/i);
    expect(ar['forms.termsCardTitle']).not.toBe(ar['forms.copyDraft']);
    expect(ar['forms.healthDataNoticeTitle']).not.toBe(ar['forms.copyDraft']);
  });
});
