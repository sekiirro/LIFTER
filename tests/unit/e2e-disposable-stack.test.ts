import { describe, expect, it } from 'vitest';
import { isDisposableStackC } from '../e2e/disposable-stack';

describe('E2E disposable stack guard', () => {
  it('does not accept injected URLs as proof of Stack C identity', () => {
    expect(
      isDisposableStackC({
        API_URL: 'http://127.0.0.1:35421',
        DB_URL: 'postgres://postgres:postgres@127.0.0.1:35422/postgres',
      }),
    ).toBe(false);
    expect(
      isDisposableStackC({
        LIFTER_SUPABASE_STACK: 'a',
        API_URL: 'http://127.0.0.1:35421',
        DB_URL: 'postgres://postgres:postgres@127.0.0.1:35422/postgres',
      }),
    ).toBe(false);
  });

  it('accepts only explicit Stack C identity with its configured endpoints', () => {
    expect(
      isDisposableStackC({
        LIFTER_SUPABASE_STACK: 'c',
        API_URL: 'http://127.0.0.1:35421',
        DB_URL: 'postgres://postgres:postgres@127.0.0.1:35422/postgres',
      }),
    ).toBe(true);
  });
});
