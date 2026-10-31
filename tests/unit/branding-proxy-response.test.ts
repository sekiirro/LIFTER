import { describe, expect, it, vi } from 'vitest';
import {
  createBrandingProxyResponse,
  type BrandingProxyAsset,
} from '../../lib/branding/proxy-response';

const token = 'a'.repeat(42) + 'A';
const handle = 'b'.repeat(42) + 'A';
const asset: BrandingProxyAsset = {
  bucket: 'branding-validated',
  object: `${'c'.repeat(8)}-${'d'.repeat(4)}-4${'e'.repeat(3)}-8${'f'.repeat(3)}-${'1'.repeat(12)}/validated/logo/${'a'.repeat(64)}.png`,
  contentType: 'image/png',
  byteSize: 8,
};
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function setup() {
  const resolve = vi.fn().mockResolvedValue(asset);
  const download = vi.fn().mockResolvedValue(png);
  return { resolve, download, dependencies: { resolve, download } };
}

describe('branding proxy response', () => {
  it('returns only the current authorized image after a final token/version recheck', async () => {
    const { resolve, download, dependencies } = setup();
    const response = await createBrandingProxyResponse(
      new Request(
        `https://example.test/api/branding/${token}/logo?handle=${handle}`,
      ),
      { token, slot: 'logo', handle },
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe('8');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenCalledWith(asset, {
      token,
      handle,
      slot: 'logo',
    });
  });

  it.each([
    ['range', { range: 'bytes=0-3' }],
    ['conditional cache', { 'if-none-match': '"x"' }],
    [
      'conditional time',
      { 'if-modified-since': 'Wed, 21 Oct 2015 07:28:00 GMT' },
    ],
  ])(
    'rejects %s paths before resolving or downloading bytes',
    async (_label, headers) => {
      const { resolve, download, dependencies } = setup();
      const response = await createBrandingProxyResponse(
        new Request(
          `https://example.test/api/branding/${token}/logo?handle=${handle}`,
          {
            headers,
          },
        ),
        { token, slot: 'logo', handle },
        dependencies,
      );
      expect(response.status).toBe(404);
      expect(resolve).not.toHaveBeenCalled();
      expect(download).not.toHaveBeenCalled();
    },
  );

  it('returns the same generic response for invalid metadata and a publication race', async () => {
    const first = setup();
    first.resolve.mockResolvedValueOnce(asset).mockResolvedValueOnce(null);
    const raced = await createBrandingProxyResponse(
      new Request(
        `https://example.test/api/branding/${token}/logo?handle=${handle}`,
      ),
      { token, slot: 'logo', handle },
      first.dependencies,
    );
    const second = setup();
    second.resolve.mockResolvedValue(null);
    const invalid = await createBrandingProxyResponse(
      new Request(
        `https://example.test/api/branding/${token}/logo?handle=${handle}`,
      ),
      { token, slot: 'logo', handle },
      second.dependencies,
    );
    expect(raced.status).toBe(404);
    expect(invalid.status).toBe(404);
    expect(await raced.text()).toBe(await invalid.text());
    expect(first.download).toHaveBeenCalledOnce();
  });

  it('rejects mismatched bytes, unsafe sizes, and arbitrary slot paths', async () => {
    const spoofed = setup();
    spoofed.download.mockResolvedValue(
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    );
    const badBytes = await createBrandingProxyResponse(
      new Request(
        `https://example.test/api/branding/${token}/logo?handle=${handle}`,
      ),
      { token, slot: 'logo', handle },
      spoofed.dependencies,
    );
    expect(badBytes.status).toBe(404);

    const wrongSlot = setup();
    wrongSlot.resolve.mockResolvedValue({
      ...asset,
      object: asset.object.replace('/logo/', '/banner/'),
    });
    const wrongPath = await createBrandingProxyResponse(
      new Request(
        `https://example.test/api/branding/${token}/logo?handle=${handle}`,
      ),
      { token, slot: 'logo', handle },
      wrongSlot.dependencies,
    );
    expect(wrongPath.status).toBe(404);
    expect(wrongSlot.download).not.toHaveBeenCalled();
  });
});
