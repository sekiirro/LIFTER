import { afterEach, expect, it, vi } from 'vitest';

const proxy = vi.hoisted(() => ({ resolve: vi.fn(), download: vi.fn() }));
vi.mock('../../lib/branding/public-read', () => ({
  resolveBrandingAsset: proxy.resolve,
  downloadBrandingAsset: proxy.download,
}));

import { GET, POST } from '../../app/api/branding/[token]/[role]/route';

const token = 'a'.repeat(42) + 'A';
const handle = 'b'.repeat(42) + 'A';
const asset = {
  bucket: 'branding-validated' as const,
  object: `${'c'.repeat(8)}-${'d'.repeat(4)}-4${'e'.repeat(3)}-8${'f'.repeat(3)}-${'1'.repeat(12)}/validated/logo/${'a'.repeat(64)}.png`,
  contentType: 'image/png' as const,
  byteSize: 8,
};

afterEach(() => vi.resetAllMocks());

it('routes only the canonical token, role and opaque handle to the proxy contract', async () => {
  proxy.resolve.mockResolvedValue(asset);
  proxy.download.mockResolvedValue(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const response = await GET(
    new Request(
      `https://example.test/api/branding/${token}/logo?handle=${handle}`,
    ),
    { params: Promise.resolve({ token, role: 'logo' }) },
  );
  expect(response.status).toBe(200);
  expect(proxy.resolve).toHaveBeenCalledTimes(2);
  expect(proxy.download).toHaveBeenCalledOnce();
});

it('rejects additional selectors and unsupported methods without resolving assets', async () => {
  const extraSelector = await GET(
    new Request(
      `https://example.test/api/branding/${token}/logo?handle=${handle}&version=1`,
    ),
    { params: Promise.resolve({ token, role: 'logo' }) },
  );
  const unsupported = await POST(
    new Request(
      `https://example.test/api/branding/${token}/logo?handle=${handle}`,
      {
        method: 'POST',
      },
    ),
    { params: Promise.resolve({ token, role: 'logo' }) },
  );
  expect(extraSelector.status).toBe(404);
  expect(unsupported.status).toBe(404);
  expect(proxy.resolve).not.toHaveBeenCalled();
  expect(proxy.download).not.toHaveBeenCalled();
});
