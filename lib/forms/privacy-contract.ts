export type FormsPublicErrorCode =
  'answer_too_long' | 'payload_too_large' | 'unavailable';

const publicErrorCodes = new Set<FormsPublicErrorCode>([
  'answer_too_long',
  'payload_too_large',
  'unavailable',
]);

/** Headers required on every server response that can carry answer data. */
export function formsPrivateNoStoreHeaders(): HeadersInit {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    Vary: 'Authorization, Cookie',
  };
}

/** Use the externally visible URL supplied by the server framework; do not trust forwarded headers here. */
export function requestUsesHttps(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return true;
  return (
    process.env.LIFTER_E2E_ALLOW_HTTP === 'true' &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  );
}

/** Convert internal failures to a short allow-listed code without reflecting error details. */
export function mapFormsPublicError(failure: unknown): {
  code: FormsPublicErrorCode;
} {
  if (
    typeof failure === 'string' &&
    publicErrorCodes.has(failure as FormsPublicErrorCode)
  ) {
    return { code: failure as FormsPublicErrorCode };
  }
  return { code: 'unavailable' };
}
