import { expect, it } from 'vitest';
import { registrationBrandName } from '../../lib/branding/registration-name';

it('uses the no-publication fallback when both localized values are empty', () => {
  expect(
    registrationBrandName(
      { ar: ' ', en: '' },
      'en',
      'DRAFT: Nothing published yet',
    ),
  ).toBe('DRAFT: Nothing published yet');
});

it('falls back to the other published locale before the generic name', () => {
  expect(
    registrationBrandName({ ar: 'الاسم العربي', en: '' }, 'en', 'LIFTER'),
  ).toBe('الاسم العربي');
});
