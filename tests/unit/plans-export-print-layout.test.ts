import { describe, expect, it } from 'vitest';
import {
  PrintLayoutError,
  resolvePrintLayout,
} from '../../lib/plans/export/print-layout';

describe('F17 export print layout', () => {
  it('returns a frozen RTL descriptor for Arabic', () => {
    const layout = resolvePrintLayout('ar');

    expect(layout).toEqual({
      lang: 'ar',
      dir: 'rtl',
      textAlign: 'start',
      documentClass: 'print-document print-document-ar',
    });
    expect(Object.isFrozen(layout)).toBe(true);
  });

  it('returns a frozen LTR descriptor for English', () => {
    const layout = resolvePrintLayout('en');

    expect(layout).toEqual({
      lang: 'en',
      dir: 'ltr',
      textAlign: 'start',
      documentClass: 'print-document print-document-en',
    });
    expect(Object.isFrozen(layout)).toBe(true);
  });

  it('rejects unsupported locales with a typed error', () => {
    for (const locale of ['fr', 'ar-SA', 'en-US', '', 'AR']) {
      let error: unknown;
      try {
        resolvePrintLayout(locale);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(PrintLayoutError);
      expect((error as PrintLayoutError).code).toBe('invalid_print_locale');
      expect((error as PrintLayoutError).message).toContain(locale);
    }
  });

  it('never exposes a mutable descriptor', () => {
    const layout = resolvePrintLayout('ar') as {
      dir: 'rtl' | 'ltr';
    };

    expect(() => {
      layout.dir = 'ltr';
    }).toThrow(TypeError);
  });
});
