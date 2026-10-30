import { describe, expect, it } from 'vitest';
import {
  formsPrivateNoStoreHeaders,
  mapFormsPublicError,
  requestUsesHttps,
} from '../../lib/forms/privacy-contract';

describe('T005 private Forms transport and safe errors', () => {
  it('requires HTTPS and marks answer responses private and non-cacheable', () => {
    expect(
      requestUsesHttps(new Request('https://forms.example.test/answers')),
    ).toBe(true);
    expect(
      requestUsesHttps(new Request('http://forms.example.test/answers')),
    ).toBe(false);
    const headers = new Headers(formsPrivateNoStoreHeaders());
    expect(headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(headers.get('pragma')).toBe('no-cache');
    expect(headers.get('vary')).toContain('Authorization');
  });

  it('allow-lists public errors and never reflects provider/database canaries', () => {
    expect(mapFormsPublicError('answer_too_long')).toEqual({
      code: 'answer_too_long',
    });
    const canary = 'FORMS-PRIVATE-CANARY-db-provider-secret';
    const mapped = mapFormsPublicError(new Error(canary));
    expect(mapped).toEqual({ code: 'unavailable' });
    expect(JSON.stringify(mapped)).not.toContain(canary);

    const rawErrorMutation = (error: unknown) => ({ code: String(error) });
    expect(JSON.stringify(rawErrorMutation(new Error(canary)))).toContain(
      canary,
    );
    expect(JSON.stringify(rawErrorMutation(new Error(canary)))).not.toEqual(
      JSON.stringify(mapped),
    );
  });
});
