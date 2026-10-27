import { describe, expect, it } from 'vitest';
import { safeReturnTo } from '../../lib/auth/redirect';

describe('safeReturnTo', () => {
  it.each(['/', '/a?b=1'])('accepts %s', (path) => {
    expect(safeReturnTo(path)).toBe(path);
  });
  it.each([
    '//evil',
    '/\\evil',
    'https://evil',
    '/%2F%2Fevil',
    'javascript:',
    '/%5cevil',
    '/%252f%252fevil',
    '/a\n',
    '/a\r',
    '/a\t',
    '/%00',
    '/%7f',
    '/%',
    '',
    null,
    undefined,
    42,
    {},
    ['/a'],
    `/${'a'.repeat(512)}`,
  ])('rejects unsafe values %#', (value) => {
    expect(safeReturnTo(value)).toBe('/');
  });
});
