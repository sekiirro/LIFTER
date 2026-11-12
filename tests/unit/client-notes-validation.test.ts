import { describe, expect, it } from 'vitest';
import {
  isUuid,
  normalizeClientNoteBody,
} from '../../lib/client-notes/validation';

describe('client note input validation', () => {
  it('trims the complete Unicode boundary whitespace before counting', () => {
    expect(normalizeClientNoteBody('\u2003hello\u00a0')).toBe('hello');
    expect(normalizeClientNoteBody(` ${'x'.repeat(5000)}\t`)).toBe(
      'x'.repeat(5000),
    );
    expect(normalizeClientNoteBody('x')).toBe('x');
    expect(normalizeClientNoteBody('x'.repeat(5000))).toBe('x'.repeat(5000));
    expect(normalizeClientNoteBody('x'.repeat(5001))).toBeNull();
    expect(normalizeClientNoteBody('one\ninside\ttext')).toBe(
      'one\ninside\ttext',
    );
    expect(normalizeClientNoteBody('🧪'.repeat(5000))).toBe(
      '🧪'.repeat(5000),
    );
  });

  it('rejects blank and whitespace-only, NUL, and non-string bodies', () => {
    expect(normalizeClientNoteBody('')).toBeNull();
    expect(normalizeClientNoteBody(' \t\n')).toBeNull();
    expect(normalizeClientNoteBody('\u2003\u00a0')).toBeNull();
    expect(normalizeClientNoteBody('\u00a0')).toBeNull();
    expect(normalizeClientNoteBody('valid\u0000body')).toBeNull();
    expect(normalizeClientNoteBody(null)).toBeNull();
  });

  it('accepts UUID identifiers only', () => {
    expect(isUuid('50000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});
