import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { readServerEnv } from './env';

export function createAdminClient() {
  const env = readServerEnv();
  if (!env) return null;
  return createClient(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, redirect: 'manual' }),
    },
  });
}
