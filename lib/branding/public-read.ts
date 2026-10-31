import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { isSecureUrl } from '../supabase/env';
import { readBrandingCredential } from './credentials';
import type { BrandingProxyAsset } from './proxy-response';

export type BrandingAssetMetadata = BrandingProxyAsset;

function proxyClient() {
  try {
    const jwt = readBrandingCredential('branding_proxy');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!jwt || !url || !key || !isSecureUrl(url)) return null;
    return createClient(url, key, {
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
  } catch {
    return null;
  }
}

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
    const client = proxyClient();
    if (!client) return null;
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
      !new RegExp(
        `^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\\/validated\\/${slot}\\/[0-9a-f]{64}(?:-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})?\\.(png|webp)$`,
        'i',
      ).test(r.object) ||
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

/** Download only through the restricted proxy credential and exact Storage read. */
export async function downloadBrandingAsset(
  asset: BrandingAssetMetadata,
  context: { token: string; handle: string; slot: 'logo' | 'banner' },
): Promise<Uint8Array | null> {
  if (
    asset.bucket !== 'branding-validated' ||
    !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(context.token) ||
    !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(context.handle) ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/validated\/(logo|banner)\/[0-9a-f]{64}(?:-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})?\.(png|webp)$/i.test(
      asset.object,
    ) ||
    !new RegExp(`/validated/${context.slot}/`, 'i').test(asset.object)
  )
    return null;
  try {
    const jwt = readBrandingCredential('branding_proxy');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    const limit = context.slot === 'logo' ? 4 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!jwt || !url || !key || !isSecureUrl(url) || asset.byteSize > limit)
      return null;
    const path = asset.object.split('/').map(encodeURIComponent).join('/');
    const endpoint = `${url.replace(/\/$/, '')}/storage/v1/object/authenticated/${asset.bucket}/${path}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        apikey: key,
        Authorization: `Bearer ${jwt}`,
        Accept: asset.contentType,
        'x-lifter-registration-token': context.token,
        'x-lifter-render-handle': context.handle,
        'x-lifter-brand-slot': context.slot,
      },
    });
    if (
      response.status !== 200 ||
      response.headers.get('content-type')?.split(';', 1)[0]?.trim() !==
        asset.contentType ||
      (response.headers.has('content-encoding') &&
        response.headers.get('content-encoding') !== 'identity')
    ) {
      await response.body?.cancel();
      return null;
    }
    const lengthHeader = response.headers.get('content-length');
    if (lengthHeader !== null && Number(lengthHeader) !== asset.byteSize) {
      await response.body?.cancel();
      return null;
    }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const bytes = new Uint8Array(asset.byteSize);
    let offset = 0;
    try {
      while (offset < bytes.length) {
        const { done, value } = await reader.read();
        if (done || !value || offset + value.byteLength > bytes.length) {
          await reader.cancel();
          return null;
        }
        bytes.set(value, offset);
        offset += value.byteLength;
      }
      const { done, value } = await reader.read();
      if (!done || value?.byteLength) {
        await reader.cancel();
        return null;
      }
      return bytes;
    } finally {
      reader.releaseLock();
    }
  } catch {
    return null;
  }
}
