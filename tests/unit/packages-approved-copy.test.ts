/**
 * Byte-exact check of the S65-PO-20 approved /packages copy.
 * Source: C:/Users/NEW LAP/.lifter/runs/s65-po/s65-po-20.verbatim.txt (PO approval).
 */
import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const APPROVED = {
  'reports.collections.empty': {
    en: 'No collections in this period.',
    ar: 'مفيش تحصيلات في الفترة دي.',
  },
  'reports.collections.loadError': {
    en: 'Unable to load collections. Please try again.',
    ar: 'مش عارفين نحمّل التحصيلات. حاول تاني.',
  },
  'reports.collections.help': {
    en: 'Shows actual collections only. Settlement records are separate.',
    ar: 'دي التحصيلات الفعلية بس. التسويات في سجل لوحدها.',
  },
  'reports.commissions.empty': {
    en: 'No commissions in this period.',
    ar: 'مفيش عمولات في الفترة دي.',
  },
  'reports.commissions.loadError': {
    en: 'Unable to load commissions. Please try again.',
    ar: 'مش عارفين نحمّل العمولات. حاول تاني.',
  },
  'reports.commissions.help': {
    en: 'Converted commission is visible to the Platform Owner and workspace owners only.',
    ar: 'العمولة المحوّلة بتظهر لصاحب المنصة وأصحاب مساحات العمل بس.',
  },
  'reports.installments.empty': {
    en: 'No installments due.',
    ar: 'مفيش أقساط مستحقة.',
  },
  'reports.installments.loadError': {
    en: 'Unable to load installments. Please try again.',
    ar: 'مش عارفين نحمّل الأقساط. حاول تاني.',
  },
  'reports.installments.help': {
    en: 'Lists due dates with paid and remaining amounts.',
    ar: 'هنا مواعيد الاستحقاق مع اللي اتدفع واللي باقي.',
  },
  'reports.title': { en: 'Reports', ar: 'التقارير' },
  'reports.month': { en: 'Month', ar: 'الشهر' },
  'reports.previousMonth': { en: 'Previous month', ar: 'الشهر اللي فات' },
  'reports.nextMonth': { en: 'Next month', ar: 'الشهر الجاي' },
  'reports.loading': { en: 'Loading reports…', ar: 'بنحمّل التقارير…' },
  'reports.denied': {
    en: 'You cannot view reports.',
    ar: 'مش مسموح لك تشوف التقارير.',
  },
  'reports.section.collections': { en: 'Collections', ar: 'التحصيلات' },
  'reports.section.commissions': { en: 'Commissions', ar: 'العمولات' },
  'reports.section.installments': { en: 'Installments', ar: 'الأقساط' },
  'reports.column.date': { en: 'Date', ar: 'التاريخ' },
  'reports.column.package': { en: 'Package', ar: 'الباقة' },
  'reports.column.client': { en: 'Client', ar: 'العميل' },
  'reports.column.amount': { en: 'Amount', ar: 'المبلغ' },
  'reports.column.currency': { en: 'Currency', ar: 'العملة' },
  'reports.column.convertedEgp': {
    en: 'Converted (EGP)',
    ar: 'المحوّل (جنيه مصري)',
  },
  'reports.column.commission': { en: 'Commission', ar: 'العمولة' },
  'reports.column.pendingRates': { en: 'Pending rates', ar: 'أسعار مستنية' },
  'reports.column.dueOn': { en: 'Due date', ar: 'تاريخ الاستحقاق' },
  'reports.column.paid': { en: 'Paid', ar: 'المدفوع' },
  'reports.column.remaining': { en: 'Remaining', ar: 'الباقي' },
  'reports.totalConvertedEgp': {
    en: 'Converted total (EGP)',
    ar: 'الإجمالي المحوّل (جنيه مصري)',
  },
  'reports.statusPendingRate': { en: 'Rate pending', ar: 'السعر لسه مستني' },
  'reports.installmentClient': { en: 'Installment client', ar: 'عميل أقساط' },
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

describe('S65-PO-20 and S69-PO-6 approved package/report copy', () => {
  it.each(Object.entries(APPROVED))(
    '%s is byte-exact in English and Arabic',
    (key, value) => {
      expect(en[key as keyof typeof en]).toBe(value.en);
      expect(ar[key as keyof typeof ar]).toBe(value.ar);
    },
  );

  it('keeps approved text free of UTF-8 mojibake markers', () => {
    for (const value of Object.values(APPROVED)) {
      expect(value.en).not.toMatch(/[ØÙÃ�]/);
      expect(value.ar).not.toMatch(/[ØÙÃ�]/);
    }
  });

  it('keeps generic error messages for denied and unavailable outcomes', () => {
    expect(en['packages.denied']).toBeTruthy();
    expect(en['packages.unavailable']).toBeTruthy();
    expect(ar['packages.denied']).toBeTruthy();
    expect(ar['packages.unavailable']).toBeTruthy();
  });
});
