import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

type Copy = Record<string, { en: string; ar: string }>;

// S57-PO-12 (2026-11-15) approved F23 measurement copy. EN is the PO wording
// exactly; no trailing period, matching the catalog's toast convention
// ("Changes saved", "Saved successfully").
const approved: Copy = {
  'progress.measurement.add': { en: 'Add measurement', ar: 'ضيف قياس جديد' },
  'progress.measurement.edit': { en: 'Edit measurement', ar: 'عدّل القياس' },
  'progress.measurement.saved': {
    en: 'Measurement saved',
    ar: 'القياس اتسجّل',
  },
  'progress.measurements.empty': {
    en: 'No measurements recorded',
    ar: 'لسه مفيش قياسات متسجلة',
  },
  // S55-PO-10 approved text, preserved per S57-PO-12 ("Preserve all other
  // approved copy"). The PO's 2026-11-14 replacement proposal stays pending.
  'progress.measurement.duplicateSameDay': {
    en: 'A measurement already exists for this day. Edit the existing record instead.',
    ar: 'فيه قياس متسجل لليوم ده. عدّل القياس الموجود بدل ما تضيف واحد جديد.',
  },
};

// Proposed by the PO on 2026-11-14 and NOT yet approved. Pinned so any change
// is a deliberate, reviewed catalog edit.
const proposed: Copy = {
  'progress.measurement.value': { en: 'Value', ar: 'القيمة' },
  'progress.measurement.date': { en: 'Date', ar: 'التاريخ' },
  'progress.measurement.save': { en: 'Save measurement', ar: 'احفظ القياس' },
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

describe('spec 023 copy', () => {
  it.each(Object.entries(approved))(
    'pins S57-PO-12 approved %s in EN and AR',
    (key, copy) => {
      expect(en[key as keyof typeof en]).toBe(copy.en);
      expect(ar[key as keyof typeof ar]).toBe(copy.ar);
    },
  );

  it.each(Object.entries(proposed))(
    'pins still-proposed %s in EN and AR',
    (key, copy) => {
      expect(en[key as keyof typeof en]).toBe(copy.en);
      expect(ar[key as keyof typeof ar]).toBe(copy.ar);
    },
  );

  it('preserves the other S55-PO-10 approved progress copy', () => {
    expect(en['progress.title']).toBe('Progress');
    expect(ar['progress.title']).toBe('التقدم');
    expect(en['progress.measurements.title']).toBe('Measurements');
    expect(ar['progress.measurements.title']).toBe('القياسات');
    expect(en['checkin.completed.notGate']).toBe(
      'Check-ins do not block access to your account.',
    );
  });
});
