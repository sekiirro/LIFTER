import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { isSecureUrl } from '../supabase/env';
export type PublicBrandingProjection = {
  name: { ar: string; en: string };
  color: `#${string}`;
  bannerAlt: { ar: string; en: string };
  logo: boolean;
  banner: boolean;
};

export type OpenResult =
  | {
      status: 'valid';
      workspace_name: string;
      render_handle?: string;
      branding?: PublicBrandingProjection;
    }
  | { status: 'invalid' };

function parseBrandingProjection(
  value: unknown,
): PublicBrandingProjection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(',') !== 'banner,bannerAlt,color,logo,name' ||
    typeof row.logo !== 'boolean' ||
    typeof row.banner !== 'boolean' ||
    typeof row.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(row.color)
  )
    return null;
  const localized = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      return null;
    const values = candidate as Record<string, unknown>;
    if (
      Object.keys(values).sort().join(',') !== 'ar,en' ||
      typeof values.ar !== 'string' ||
      typeof values.en !== 'string'
    )
      return null;
    return { ar: values.ar, en: values.en };
  };
  const name = localized(row.name);
  const bannerAlt = localized(row.bannerAlt);
  if (
    !name ||
    !bannerAlt ||
    !(name.ar.trim() || name.en.trim()) ||
    (row.banner && !(bannerAlt.ar.trim() && bannerAlt.en.trim()))
  )
    return null;
  return {
    name,
    color: row.color.toUpperCase() as `#${string}`,
    bannerAlt,
    logo: row.logo,
    banner: row.banner,
  };
}

export function parseOpenResult(value: unknown): OpenResult {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    const branding =
      'branding' in row ? parseBrandingProjection(row.branding) : undefined;
    if (
      Object.keys(row).every((key) =>
        ['status', 'workspace_name', 'render_handle', 'branding'].includes(key),
      ) &&
      row.status === 'valid' &&
      typeof row.workspace_name === 'string' &&
      row.workspace_name.length > 0 &&
      (!('render_handle' in row) ||
        (typeof row.render_handle === 'string' &&
          /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(row.render_handle))) &&
      (!('branding' in row) || branding !== null)
    )
      return {
        status: 'valid',
        workspace_name: row.workspace_name,
        ...('render_handle' in row
          ? { render_handle: row.render_handle as string }
          : {}),
        ...(branding ? { branding } : {}),
      };
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
