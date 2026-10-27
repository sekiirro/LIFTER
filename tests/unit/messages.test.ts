import { describe, expect, it } from 'vitest';
import { getMessages } from '../../lib/i18n';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

describe('messages', () => {
  it('has identical nonempty catalogs', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    for (const catalog of [ar, en])
      for (const message of Object.values(catalog))
        expect(message.trim().length).toBeGreaterThan(0);
    expect(getMessages('ar')).toBe(ar);
    expect(getMessages('en')).toBe(en);
  });
  it('uses the specified Arabic navigation labels', () => {
    expect([
      ar['nav.home'],
      ar['nav.clients'],
      ar['nav.workout'],
      ar['nav.nutrition'],
      ar['nav.progress'],
      ar['nav.more'],
    ]).toEqual([
      'الرئيسية',
      'العملاء',
      'التمرين',
      'التغذية',
      'التقدم',
      'المزيد',
    ]);
  });
});
