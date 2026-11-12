import { describe, expect, it } from 'vitest';
import {
  isUuid,
  normalizeClientNoteBody,
} from '../../lib/client-notes/validation';

describe('client note input validation', () => {
  it('trims Unicode whitespace before counting stored code points', () => {
    expect(normalizeClientNoteBody('\u2003hello\u00a0')).toBe('hello');
    expect(normalizeClientNoteBody('😀'.repeat(5000))).toBe('😀'.repeat(5000));
  });

  it('rejects empty, over-limit, NUL, and non-string bodies', () => {
    expect(normalizeClientNoteBody('\u2003\u00a0')).toBeNull();
    expect(normalizeClientNoteBody('😀'.repeat(5001))).toBeNull();
    expect(normalizeClientNoteBody('valid\u0000body')).toBeNull();
    expect(normalizeClientNoteBody(null)).toBeNull();
  });

  it('accepts UUID identifiers only', () => {
    expect(isUuid('50000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});
