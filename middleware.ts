import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { readServerEnv } from './lib/supabase/env';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = readServerEnv();
  let authenticated = false;
  if (env) {
    try {
      const client = createServerClient(env.url, env.anonKey, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(values) {
            for (const { name, value } of values)
              request.cookies.set(name, value);
            response = NextResponse.next({ request });
            for (const { name, value, options } of values)
              response.cookies.set(name, value, options);
          },
        },
      });
      const { data, error } = await client.auth.getUser();
      authenticated = !error && !!data.user;
    } catch {
      authenticated = false;
    }
  }
  const path = request.nextUrl.pathname;
  // Exactly one non-empty segment, with an optional single trailing slash. Next
  // usually canonicalizes the slash before middleware; keeping this exact-shape
  // check (no wider /register prefix) means a token can never fall through to a
  // login redirect with the token in `next`.
  const registrationPath = /^\/register\/[^/]+\/?$/.test(path);
  const registrationTree = path.startsWith('/register');
  const brandingProxyTree = path.startsWith('/api/branding');
  const brandingProxyPath = /^\/api\/branding\/[^/]+\/(?:logo|banner)$/.test(
    path,
  );
  const publicPath =
    registrationPath ||
    brandingProxyPath ||
    ['/login', '/auth/recovery', '/api/health', '/print-sample'].includes(
      path,
    ) ||
    path === '/showcase' ||
    path.startsWith('/showcase/') ||
    path.startsWith('/_next/') ||
    (!path.startsWith('/register') &&
      !path.startsWith('/registration-links') &&
      /\.(?:ico|png|jpe?g|gif|svg|webp|avif|css|js|map|woff2?|ttf|txt|webmanifest)$/i.test(
        path,
      ));
  if (!authenticated && !publicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    // Public register paths are never fed back through `next`; for the whole
    // /register subtree this also keeps a token out of redirect URLs when the
    // requested path is not the exact public shape (nested/trailing variants).
    if (!registrationTree && !brandingProxyTree)
      url.searchParams.set('next', `${path}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll())
      redirect.cookies.set(cookie);
    if (registrationTree || brandingProxyTree)
      setRegistrationPrivacyHeaders(redirect);
    return redirect;
  }
  if (registrationTree || brandingProxyTree)
    setRegistrationPrivacyHeaders(response);
  return response;
}

function setRegistrationPrivacyHeaders(response: NextResponse) {
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
