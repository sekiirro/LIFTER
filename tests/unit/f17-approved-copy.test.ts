import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';
import {
  f17ApprovedCopy,
  f17S28ApprovedCopy,
} from '../fixtures/f17-approved-copy';

type ApprovedKey = keyof typeof f17ApprovedCopy;
const approvedKeys = Object.keys(f17ApprovedCopy) as ApprovedKey[];
type S28ApprovedKey = keyof typeof f17S28ApprovedCopy;
const s28ApprovedKeys = Object.keys(f17S28ApprovedCopy) as S28ApprovedKey[];

describe('F17 approved copy (S27-PO-2)', () => {
  it('matches every approved CSV value in both locales', () => {
    for (const key of approvedKeys) {
      expect(ar[key], key).toBe(f17ApprovedCopy[key].ar);
      expect(en[key], key).toBe(f17ApprovedCopy[key].en);
    }
  });

  it('does not mark approved keys as DRAFT', () => {
    for (const key of approvedKeys) {
      expect(ar[key], key).not.toMatch(/\bDRAFT\b/);
      expect(en[key], key).not.toMatch(/\bDRAFT\b/);
    }
  });

  it('keeps the S27-approved rest label outside the DRAFT set', () => {
    expect(ar['builder.restHint']).toBe('مدة الراحة (بالثواني)');
    expect(en['builder.restHint']).toBe('Rest (seconds)');
    expect(ar['builder.restHint']).not.toMatch(/\bDRAFT\b/);
    expect(en['builder.restHint']).not.toMatch(/\bDRAFT\b/);
  });

  it('pins every S28-approved F17 T036/T037 value in both locales', () => {
    expect(s28ApprovedKeys).toHaveLength(138);
    expect(
      s28ApprovedKeys.filter((key) => key.startsWith('builder.')),
    ).toHaveLength(74);
    expect(
      s28ApprovedKeys.filter((key) => key.startsWith('templates.')),
    ).toHaveLength(64);

    for (const key of s28ApprovedKeys) {
      expect(ar[key], key).toBe(f17S28ApprovedCopy[key].ar);
      expect(en[key], key).toBe(f17S28ApprovedCopy[key].en);
      expect(ar[key], key).not.toMatch(/\bDRAFT\b/);
      expect(en[key], key).not.toMatch(/\bDRAFT\b/);
    }
  });

  it('leaves no F17 DRAFT marker in either locale source', () => {
    for (const locale of ['ar', 'en']) {
      const source = readFileSync(
        new URL(`../../lib/i18n/messages/${locale}.ts`, import.meta.url),
        'utf8',
      );
      expect(source, locale).not.toMatch(/DRAFT \(F17 T0(?:36|37)\)/);
    }
  });
});
