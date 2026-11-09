import { describe, expect, it } from 'vitest';
import { buildLoginRedirectUrl } from '../e2e/test-origin.mjs';

describe('login redirect expectation URL', () => {
  it('normalizes a trailing slash in the base URL', () => {
    expect(
      buildLoginRedirectUrl('/packages?a=1', 'http://localhost:3000/'),
    ).toBe('http://localhost:3000/login?next=%2Fpackages%3Fa%3D1');
  });
});
