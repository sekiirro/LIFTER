import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';
import {
  f18ApprovedCopy,
  f18ApprovedCopyKeys,
} from '../fixtures/f18-approved-copy';

const arMessages: Record<string, string> = ar;
const enMessages: Record<string, string> = en;

describe('S27-PO-2 approved F18 copy', () => {
  it('stores every approved F18 batch row in the fixture', () => {
    expect(f18ApprovedCopyKeys).toHaveLength(67);
  });

  it.each(f18ApprovedCopyKeys)('matches approved Arabic copy for %s', (key) => {
    expect(arMessages[key]).toBe(f18ApprovedCopy[key].ar);
    expect(arMessages[key]).not.toContain('DRAFT');
  });

  it.each(f18ApprovedCopyKeys)(
    'matches approved English copy for %s',
    (key) => {
      expect(enMessages[key]).toBe(f18ApprovedCopy[key].en);
      expect(enMessages[key]).not.toContain('DRAFT');
    },
  );
});
