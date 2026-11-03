import { describe, expect, it } from 'vitest';
import { getTestCookieOrigin } from '../e2e/test-origin.mjs';

describe('getTestCookieOrigin', () => {
  it('uses the origin when the base URL contains a path', () => {
    expect(getTestCookieOrigin('http://localhost:3000/nested/')).toBe(
      'http://localhost:3000',
    );
  });
});
