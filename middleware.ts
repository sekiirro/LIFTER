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
  const publicPath =
    ['/login', '/auth/recovery', '/api/health', '/print-sample'].includes(
      path,
    ) ||
    path === '/showcase' ||
    path.startsWith('/showcase/') ||
    path.startsWith('/_next/') ||
    /\.(?:ico|png|jpe?g|gif|svg|webp|avif|css|js|map|woff2?|ttf|txt|webmanifest)$/i.test(
      path,
    );
  if (!authenticated && !publicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', `${path}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll())
      redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
