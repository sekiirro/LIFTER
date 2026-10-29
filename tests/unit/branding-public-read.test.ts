import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({ create: vi.fn(), rpc: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: m.create }));
import { resolveBrandingAsset } from '../../lib/branding/public-read';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it('has no service credential fallback and validates input before transport', async () => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'sentinel');
  vi.stubEnv('BRANDING_PROXY_JWT', '');
  expect(
    await resolveBrandingAsset('A'.repeat(43), 'A'.repeat(43), 'logo'),
  ).toBeNull();
  expect(m.create).not.toHaveBeenCalled();
});
it('uses only restricted bearer, exact RPC and no-store transport; ignores invalid metadata', async () => {
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:25421');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('BRANDING_PROXY_JWT', 'header.payload.signature');
  m.create.mockReturnValue({ rpc: m.rpc });
  const metadata = {
    status: 'ok',
    bucket: 'branding-validated',
    object: `00000000-0000-0000-0000-000000000001/${'a'.repeat(64)}.png`,
    content_type: 'image/png',
    byte_size: 24,
  };
  m.rpc.mockResolvedValue({ data: metadata, error: null });
  const r = await resolveBrandingAsset('A'.repeat(43), 'A'.repeat(43), 'logo');
  expect(r?.byteSize).toBe(24);
  expect(m.rpc).toHaveBeenCalledWith('registration_brand_asset_resolve', {
    token: 'A'.repeat(43),
    render_handle: 'A'.repeat(43),
    slot: 'logo',
  });
  m.rpc.mockResolvedValue({
    data: { ...metadata, object: 'foreign' },
    error: null,
  });
  expect(
    await resolveBrandingAsset('A'.repeat(43), 'A'.repeat(43), 'logo'),
  ).toBeNull();
});
