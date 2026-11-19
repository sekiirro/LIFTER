import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const approvedKeys = [
  'branding.logoLabel',
  'branding.bannerLabel',
  'branding.bannerAltLegend',
  'branding.bannerAltHint',
  'branding.bannerSizeHint',
  'branding.uploadFailed',
] as const;

const draftUploadKeys = [
  'branding.workspaceUnavailable',
  'branding.uploadInProgress',
  'branding.reloadDraft',
  'branding.retryRemove',
] as const;

describe('branding banner alt-text i18n', () => {
  it('keeps Arabic and English message catalogs in parity', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
  });

  it('defines every PO-approved key in both locales', () => {
    for (const key of approvedKeys) {
      expect(en[key], key).toBeTruthy();
      expect(ar[key], key).toBeTruthy();
    }
  });

  it('defines each new upload recovery label in both draft locales', () => {
    for (const key of draftUploadKeys) {
      expect(en[key], key).toBeTruthy();
      expect(ar[key], key).toBeTruthy();
      expect(ar[key], key).not.toBe(en[key]);
    }
  });

  it('uses the PO-approved copy without changing the draft labels', () => {
    expect(ar['branding.logoLabel']).toBe('شعار مساحة العمل');
    expect(en['branding.logoLabel']).toBe('Workspace logo');
    expect(ar['branding.bannerLabel']).toBe('صورة الغلاف');
    expect(en['branding.bannerLabel']).toBe('Banner image');
    expect(ar['branding.bannerAltLegend']).toBe(
      'وصف صورة الغلاف (بالعربية أو الإنجليزية)',
    );
    expect(en['branding.bannerAltLegend']).toBe(
      'Banner image description (Arabic or English)',
    );
    expect(ar['branding.bannerAltHint']).toBe(
      'أدخل وصفًا بلغة واحدة على الأقل؛ سيُستخدم الوصف المتاح عند غياب الآخر.',
    );
    expect(en['branding.bannerAltHint']).toBe(
      'Enter a description in at least one language; the available description will be used as fallback.',
    );
    expect(ar['branding.bannerSizeHint']).toBe(
      'Recommended 1600×800 (2:1). Keep important content away from the edges and the lower part of the image.',
    );
    expect(en['branding.bannerSizeHint']).toBe(
      'Recommended 1600×800 (2:1). Keep important content away from the edges and the lower part of the image.',
    );
    expect(ar['branding.uploadFailed']).toBe(
      'تعذر رفع الصورة. تحقق من نوع الملف وحجمه وأبعاده ثم حاول مجددًا.',
    );
    expect(en['branding.uploadFailed']).toBe(
      'Upload failed. Check the file type, size, and dimensions, then retry.',
    );
    expect(ar['branding.bannerAltArabic']).toBe('وصف اللافتة بالعربية');
    expect(en['branding.bannerAltArabic']).toBe('Banner description in Arabic');
  });
});
