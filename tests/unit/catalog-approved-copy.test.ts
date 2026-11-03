import { describe, expect, it } from 'vitest';
import approvedF16Copy from '../fixtures/approved-f16-copy.json';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

describe('approved F16 copy', () => {
  it('ships every approved F16 Arabic and English string verbatim', () => {
    const rows = approvedF16Copy as {
      key: keyof typeof ar;
      ar: string;
      en: string;
    }[];
    for (const row of rows) {
      expect(en[row.key], `${row.key} English copy`).toBe(row.en);
      expect(ar[row.key], `${row.key} Arabic copy`).toBe(row.ar);
    }
  });
});
