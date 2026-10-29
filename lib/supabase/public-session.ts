import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function isSecureUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

/** Cookie-backed anon client used only to inspect the visitor's normal session. */
export async function createPublicSessionClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey || !isSecureUrl(url)) return null;
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values)
            store.set(name, value, options);
        } catch {
          // Server Components cannot persist refreshed cookies.
        }
      },
    },
  });
}
