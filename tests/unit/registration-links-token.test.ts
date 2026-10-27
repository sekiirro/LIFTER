import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  generateToken,
  hashToken,
  registrationOrigin,
  registrationUrl,
} from '../../lib/registration-links/token';
let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  logs = (['log', 'info', 'error', 'warn', 'debug', 'trace'] as const).map(
    (key) => vi.spyOn(console, key).mockImplementation(() => {}),
  );
});
afterEach(() => {
  for (const log of logs) expect(log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
it('requests 32 random bytes, hashes encoded text and constructs origin-only URLs', () => {
  const random = vi.fn(() => Buffer.alloc(32));
  const token = generateToken(random);
  expect(random).toHaveBeenCalledWith(32);
  expect(token).toBe('A'.repeat(43));
  expect(token).toMatch(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);
  expect(hashToken('abc')).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  expect(hashToken(token)).not.toContain(token);
  expect(registrationUrl('http://localhost:3000', token)).toBe(
    `http://localhost:3000/register/${token}`,
  );
});
it('produces distinct deterministic generations without an entropy claim', () => {
  const random = vi
    .fn()
    .mockReturnValueOnce(Buffer.alloc(32, 1))
    .mockReturnValueOnce(Buffer.alloc(32, 2));
  const first = generateToken(random),
    second = generateToken(random);
  expect(random).toHaveBeenNthCalledWith(1, 32);
  expect(random).toHaveBeenNthCalledWith(2, 32);
  expect(first).toHaveLength(43);
  expect(second).toHaveLength(43);
  expect(first).not.toBe(second);
  expect(hashToken(first)).not.toBe(hashToken(second));
});
it.each([
  'https://example.test',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://[::1]:3000',
])('accepts safe origin %s', (value) =>
  expect(registrationOrigin(value)).toBe(new URL(value).origin),
);
it.each([
  'http://example.com',
  'https://u:p@example.com',
  'https://example.com/path',
  'https://example.com/?x=1',
  'https://example.com/#a',
  'javascript:alert(1)',
  'ftp://example.com',
  'bad',
  '',
])('rejects unsafe origin %s', (v) => expect(registrationOrigin(v)).toBeNull());
it.each([null, 1, {}, []])('rejects non-string origin %#', (v) =>
  expect(registrationOrigin(v)).toBeNull(),
);
it('propagates generation failure without a fabricated token or provider echo', () => {
  const secret = 'SENTINEL-provider-token-value';
  expect(() =>
    generateToken(() => {
      throw new Error(secret);
    }),
  ).toThrow('unavailable');
  try {
    generateToken(() => {
      throw new Error(secret);
    });
  } catch (error) {
    expect(String(error)).toBe('Error: unavailable');
    expect(String(error)).not.toContain(secret);
  }
  expect(() => generateToken(() => Buffer.alloc(31))).toThrow('unavailable');
});
it('rejects unsafe URL construction without echoing the token', () => {
  const token = 'A'.repeat(43);
  expect(() => registrationUrl('https://example.com/path', token)).toThrow(
    'unavailable',
  );
  try {
    registrationUrl('https://example.com/path', token);
  } catch (error) {
    expect(String(error)).not.toContain(token);
  }
  expect(() => registrationUrl('https://example.com', 'not-a-token')).toThrow(
    'unavailable',
  );
});
