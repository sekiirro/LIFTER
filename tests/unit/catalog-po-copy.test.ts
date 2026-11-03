import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

describe('S30 PO-approved F16 copy', () => {
  it('pins the result-neutral food save error exactly in English and Arabic', () => {
    expect(en['catalog.foodSaveErrorDescription']).toBe(
      "We couldn't confirm the save. Check the food list before retrying.",
    );
    expect(ar['catalog.foodSaveErrorDescription']).toBe(
      'تعذّر تأكيد الحفظ. راجع قائمة الطعام قبل إعادة المحاولة.',
    );
  });

  it('pins and uses the localized Kendo showcase workspace label', () => {
    expect(en['catalog.showcaseKendoWorkspace']).toBe('Kendo demo workspace');
    expect(ar['catalog.showcaseKendoWorkspace']).toBe('مساحة كيندو التجريبية');
    const page = readFileSync(
      'app/(dev)/showcase/catalog-foods/page.tsx',
      'utf8',
    );
    expect(page).toContain("label: m['catalog.showcaseKendoWorkspace']");
    const client = readFileSync(
      'app/(dev)/showcase/catalog-foods/CatalogFoodsShowcaseClient.tsx',
      'utf8',
    );
    expect(client).toContain(
      "label: messages['catalog.showcaseKendoWorkspace']",
    );
  });
});
