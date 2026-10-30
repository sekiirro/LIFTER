import { expect, it } from 'vitest';
import { registrationBrandName } from '../../lib/branding/registration-name';

it('falls back to the other published locale before the generic name', () => {
  expect(
    registrationBrandName({ ar: 'الاسم العربي', en: '' }, 'en', 'LIFTER'),
  ).toBe('الاسم العربي');
});
