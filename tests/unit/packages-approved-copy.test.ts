/**
 * Byte-exact check of the S65-PO-20 approved /packages copy.
 * Source: C:/Users/NEW LAP/.lifter/runs/s65-po/s65-po-20.verbatim.txt (PO approval).
 */
import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const APPROVED = {
  'packages.initializeCategories': {
    en: 'Set up four categories',
    ar: 'جهّز الأربع فئات',
  },
  'packages.initializeCategoriesHelp': {
    en: 'Creates the four empty Egypt / International × Year-round / Promotional categories for this workspace. No prices or offers are created.',
    ar: 'بيعمِل الأربع فئات الفاضية (مصر / دولي × طول السنـة / وقت العـروض) لمساحة العمل دي. مش بيعمل أسعار ولا عروض.',
  },
  'packages.initializeCategoriesConfirmTitle': {
    en: 'Set up four categories?',
    ar: 'نجهّز الأربع فئات؟',
  },
  'packages.initializeCategoriesConfirmBody': {
    en: 'This creates the four empty categories once for this workspace. Existing offers and history do not change.',
    ar: 'ده بيعمِل الأربع فئات الفاضية مرة واحدة لمساحة العمل دي. العروض والسجل الموجودين مش هيتغيروا.',
  },
  'packages.initializeCategoriesSuccess': {
    en: 'Four categories are ready.',
    ar: 'الأربع فئات بقوا جاهزين.',
  },
  'packages.retireOffer': { en: 'Retire offer', ar: 'وقّف العرض' },
  'packages.reactivateOffer': {
    en: 'Make available again',
    ar: 'رجّع العرض تاني',
  },
  'packages.retireConfirmTitle': {
    en: 'Retire this offer?',
    ar: 'نوقّف العرض ده؟',
  },
  'packages.retireConfirmBody': {
    en: 'New sales stop. Existing clients, links and history stay unchanged. You can make it available again later.',
    ar: 'البيع الجديد بيقف. العملا الحاليين واللينكات والسجل زي ما هم. وتقدر ترجّعه تاني بعدين.',
  },
  'packages.reactivateConfirmTitle': {
    en: 'Make this offer available again?',
    ar: 'نرجّع العرض ده تاني؟',
  },
  'packages.reactivateConfirmBody': {
    en: 'The offer returns to new sales. Existing history stays unchanged.',
    ar: 'العرض بيرجع للبيع الجديد. والسجل القديم زي ما هو.',
  },
  'packages.retireSuccess': { en: 'Offer retired.', ar: 'العرض اتوقّف.' },
  'packages.reactivateSuccess': {
    en: 'Offer is available again.',
    ar: 'العرض رجع متاح تاني.',
  },
  'packages.retiredBadge': { en: 'Retired', ar: 'موقوف' },
  'packages.emptyCatalog': {
    en: 'Create a package category, then publish its terms.',
    ar: 'اعمل فئة باقة الأول، وبعدين انشر شروطها.',
  },
} as const;

describe('S65-PO-20 approved packages copy', () => {
  it.each(Object.entries(APPROVED))(
    '%s is byte-exact in English and Arabic',
    (key, value) => {
      expect(en[key as keyof typeof en]).toBe(value.en);
      expect(ar[key as keyof typeof ar]).toBe(value.ar);
    },
  );

  it('keeps generic error messages for denied and unavailable outcomes', () => {
    expect(en['packages.denied']).toBeTruthy();
    expect(en['packages.unavailable']).toBeTruthy();
    expect(ar['packages.denied']).toBeTruthy();
    expect(ar['packages.unavailable']).toBeTruthy();
  });
});
