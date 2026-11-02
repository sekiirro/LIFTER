import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';
import { f17ApprovedCopy } from '../fixtures/f17-approved-copy';

type ApprovedKey = keyof typeof f17ApprovedCopy;
const approvedKeys = Object.keys(f17ApprovedCopy) as ApprovedKey[];

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
});
