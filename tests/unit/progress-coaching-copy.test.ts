import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

// PO 2026-11-14 PROPOSED copy for client measurement entry/edit and the weekly
// check-in configuration screen. The PO is still editing these strings: this test
// pins them so any change is a deliberate, reviewed catalog edit.
const proposed: Record<string, { en: string; ar: string }> = {
  'progress.measurement.add': { en: 'Add measurement', ar: 'ضيف قياس' },
  'progress.measurement.value': { en: 'Value', ar: 'القيمة' },
  'progress.measurement.date': { en: 'Date', ar: 'التاريخ' },
  'progress.measurement.save': { en: 'Save measurement', ar: 'احفظ القياس' },
  'progress.measurement.saved': {
    en: 'Measurement saved.',
    ar: 'القياس اتحفظ.',
  },
  'progress.measurement.duplicateSameDay': {
    en: 'A measurement already exists for this day. Edit it instead.',
    ar: 'فيه قياس متسجل لليوم ده. عدّله بدل ما تضيف جديد.',
  },
  'checkin.config.title': {
    en: 'Weekly check-in form',
    ar: 'فورم المتابعة الأسبوعية',
  },
  'checkin.config.select': {
    en: 'Choose the weekly check-in form',
    ar: 'اختار فورم المتابعة الأسبوعية',
  },
  'checkin.config.save': { en: 'Use this form', ar: 'استخدم الفورم ده' },
  'checkin.config.saved': {
    en: 'Weekly check-in form saved.',
    ar: 'اتحفظ فورم المتابعة الأسبوعية.',
  },
  'checkin.config.invalid': {
    en: 'This form needs the workout and diet adherence questions (0–10).',
    ar: 'الفورم ده لازم يكون فيه سؤالين الالتزام بالتمرين والدايت (من 0 لـ 10).',
  },
  'checkin.config.conflict': {
    en: 'Another form is already the weekly check-in.',
    ar: 'فيه فورم تاني متحدد كمتابعة أسبوعية.',
  },
};

describe('spec 023 PO-proposed copy (2026-11-14)', () => {
  it.each(Object.entries(proposed))('pins %s in EN and AR', (key, copy) => {
    expect(en[key as keyof typeof en]).toBe(copy.en);
    expect(ar[key as keyof typeof ar]).toBe(copy.ar);
  });

  it('keeps the S55-PO-10 approved edit label', () => {
    expect(en['progress.measurement.edit']).toBe('Edit measurement');
    expect(ar['progress.measurement.edit']).toBe('تعديل القياس');
  });
});
