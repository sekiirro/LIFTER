import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { isSecureUrl } from '../supabase/env';
import { readBrandingCredential } from './credentials';

export type BrandingAssetMetadata = {
  bucket: 'branding-validated';
  object: string;
  contentType: 'image/png' | 'image/webp';
  byteSize: number;
};

/** Metadata only. Image delivery, bounded buffering and final recheck are T048. */
export async function resolveBrandingAsset(
  token: string,
  handle: string,
  slot: 'logo' | 'banner',
): Promise<BrandingAssetMetadata | null> {
  const canonical = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
  if (
    !canonical.test(token) ||
    !canonical.test(handle) ||
    !['logo', 'banner'].includes(slot)
  )
    return null;
  try {
    const jwt = readBrandingCredential('branding_proxy');
    const url = process.env.SUPABASE_URL,
      key = process.env.SUPABASE_ANON_KEY;
    if (!jwt || !url || !key || !isSecureUrl(url)) return null;
    const client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { Authorization: `Bearer ${jwt}` },
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    });
    const { data: r, error } = await client.rpc(
      'registration_brand_asset_resolve',
      { token, render_handle: handle, slot },
    );
    if (
      error ||
      !r ||
      r.status !== 'ok' ||
      r.bucket !== 'branding-validated' ||
      typeof r.object !== 'string' ||
      !/^[0-9a-f-]{36}\/[0-9a-f]{64}\.(png|webp)$/.test(r.object) ||
      !['image/png', 'image/webp'].includes(r.content_type) ||
      !Number.isSafeInteger(r.byte_size) ||
      r.byte_size <= 0
    )
      return null;
    return {
      bucket: r.bucket,
      object: r.object,
      contentType: r.content_type,
      byteSize: r.byte_size,
    };
  } catch {
    return null;
  }
}
