export const testOrigin =
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export function buildLoginRedirectUrl(path, baseUrl = testOrigin) {
  const url = new URL('/login', baseUrl);
  url.searchParams.set('next', path);
  return url.toString();
}
