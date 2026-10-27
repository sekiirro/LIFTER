import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { isSecureUrl } from '../supabase/env';
export type OpenResult =
  { status: 'valid'; workspace_name: string } | { status: 'invalid' };
export function parseOpenResult(value: unknown): OpenResult {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).length === 2 &&
      row.status === 'valid' &&
      typeof row.workspace_name === 'string' &&
      row.workspace_name.length > 0
    )
      return { status: 'valid', workspace_name: row.workspace_name };
  }
  return { status: 'invalid' };
}
export async function openRegistrationLink(
  token: unknown,
): Promise<OpenResult> {
  if (
    typeof token !== 'string' ||
    !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token)
  )
    return { status: 'invalid' };
  try {
    const url = process.env.SUPABASE_URL,
      key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key || !isSecureUrl(url)) return { status: 'invalid' };
    const client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    });
    const result = await client.rpc('registration_link_open', { token });
    return result.error ? { status: 'invalid' } : parseOpenResult(result.data);
  } catch {
    return { status: 'invalid' };
  }
}
