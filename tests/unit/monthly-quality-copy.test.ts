import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';

const APPROVED = {
  'workforce.quality.title': {
    en: 'Monthly quality',
    ar: 'جودة الخدمة الشهرية',
  },
  'workforce.quality.category.transformation': {
    en: 'Transformation',
    ar: 'التحوّلات',
  },
  'workforce.quality.category.feedback': {
    en: 'Feedback',
    ar: 'آراء العملاء',
  },
  'workforce.quality.count': { en: 'Count', ar: 'العدد' },
  'workforce.quality.weight': {
    en: 'Points per item',
    ar: 'النقاط لكل حالة',
  },
  'workforce.quality.defaultHint': {
    en: 'Defaults: +1 for positive feedback, -1 for negative. Editable per Trainer.',
    ar: 'الافتراضي: +1 للرأي الإيجابي و-1 للسلبي. تقدر تعدّلها لكل مدرب.',
  },
  'workforce.quality.stale': {
    en: 'A newer revision exists. Reload before saving.',
    ar: 'فيه نسخة أحدث. حدّث قبل الحفظ.',
  },
  'workforce.quality.weight.decimalError': {
    en: 'Use at most two decimal places.',
    ar: 'استخدم خانتين عشريتين كحد أقصى.',
  },
  'workforce.quality.saved': {
    en: 'Quality entry saved.',
    ar: 'اتحفظ تقييم الجودة.',
  },
  'workforce.quality.saveError': {
    en: 'Could not save the quality entry. Try again.',
    ar: 'مقدرناش نحفظ تقييم الجودة. حاول تاني.',
  },
  'workforce.quality.revision.history': {
    en: 'Revision history',
    ar: 'سجل النسخ',
  },
  'workforce.quality.revision.history.empty': {
    en: 'No earlier revisions.',
    ar: 'مفيش نسخ سابقة.',
  },
  'workforce.quality.revision.history.column.recordedAt': {
    en: 'Recorded at',
    ar: 'اتسجلت في',
  },
  'workforce.quality.revision.effective': {
    en: 'Counted',
    ar: 'النسخة المحسوبة',
  },
  'workforce.quality.revision.earlier': {
    en: 'Earlier revision',
    ar: 'نسخة سابقة',
  },
  'workforce.quality.revision.latestNote': {
    en: 'Only the latest revision counts.',
    ar: 'آخر نسخة بس هي اللي بتتحسب.',
  },
  'workforce.quality.zeroConfirmTitle': {
    en: 'Save a zero count?',
    ar: 'تحفظ العدد صفر؟',
  },
  'workforce.quality.zeroConfirmBody': {
    en: 'A zero count replaces the value that counts for this month.',
    ar: 'العدد صفر هيحل محل القيمة المحسوبة للشهر ده.',
  },
  'workforce.quality.positiveCount': {
    en: 'Positive feedback count',
    ar: 'عدد الآراء الإيجابية',
  },
  'workforce.quality.negativeCount': {
    en: 'Negative feedback count',
    ar: 'عدد الآراء السلبية',
  },
  'workforce.quality.positiveWeight': {
    en: 'Points per positive item',
    ar: 'النقاط لكل حالة إيجابية',
  },
  'workforce.quality.negativeWeight': {
    en: 'Points per negative item',
    ar: 'النقاط لكل حالة سلبية',
  },
} as const;

const approvalRows = [
  '../../specs/027-workforce-management/copy-approved-cb01-cb03.md',
  '../../specs/027-workforce-management/copy-approved-cb02-cb04-cb05.md',
]
  .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .flatMap((record) => record.split('\n'));

describe('Monthly quality approved copy (CB-03, CB-05-D, S73-PO-5)', () => {
  it.each(Object.entries(APPROVED))(
    '%s is byte-exact in EN and AR',
    (key, copy) => {
      expect(en[key as keyof typeof en]).toBe(copy.en);
      expect(ar[key as keyof typeof ar]).toBe(copy.ar);
    },
  );

  it('traces every literal to an in-repository approval row', () => {
    for (const copy of Object.values(APPROVED)) {
      expect(
        approvalRows.some(
          (row) => row.includes(copy.en) && row.includes(copy.ar),
        ),
      ).toBe(true);
    }
  });
});
