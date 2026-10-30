export type BrandingProxyAsset = {
  bucket: 'branding-validated';
  object: string;
  contentType: 'image/png' | 'image/webp';
  byteSize: number;
};

export type BrandingProxyDependencies = {
  resolve: (
    token: string,
    handle: string,
    slot: 'logo' | 'banner',
  ) => Promise<BrandingProxyAsset | null>;
  download: (
    asset: BrandingProxyAsset,
    context: { token: string; handle: string; slot: 'logo' | 'banner' },
  ) => Promise<Uint8Array | null>;
};

const TOKEN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
const BYTE_LIMIT = { logo: 4 * 1024 * 1024, banner: 8 * 1024 * 1024 };
const privacyHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function notFound(): Response {
  return new Response('not_found', {
    status: 404,
    headers: {
      ...privacyHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': '9',
    },
  });
}

function validAsset(
  value: BrandingProxyAsset | null,
  slot: 'logo' | 'banner',
): value is BrandingProxyAsset {
  if (!value || value.bucket !== 'branding-validated') return false;
  const path = new RegExp(
    `^${UUID}/validated/${slot}/([0-9a-f]{64})(?:-${UUID})?\\.(png|webp)$`,
    'i',
  );
  const match = path.exec(value.object);
  return (
    !!match &&
    Number.isSafeInteger(value.byteSize) &&
    value.byteSize > 0 &&
    value.byteSize <= BYTE_LIMIT[slot] &&
    ((value.contentType === 'image/png' && match[2]?.toLowerCase() === 'png') ||
      (value.contentType === 'image/webp' &&
        match[2]?.toLowerCase() === 'webp'))
  );
}

function sniffed(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === 'image/png')
    return (
      bytes.length >= 8 &&
      bytes[0] === 137 &&
      bytes[1] === 80 &&
      bytes[2] === 78 &&
      bytes[3] === 71 &&
      bytes[4] === 13 &&
      bytes[5] === 10 &&
      bytes[6] === 26 &&
      bytes[7] === 10
    );
  return (
    contentType === 'image/webp' &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  );
}

function blocksConditionalDelivery(request: Request): boolean {
  return [
    'range',
    'if-range',
    'if-match',
    'if-none-match',
    'if-modified-since',
    'if-unmodified-since',
  ].some((header) => request.headers.has(header));
}

export async function createBrandingProxyResponse(
  request: Request,
  input: { token: string; slot: string; handle: string | null },
  dependencies: BrandingProxyDependencies,
): Promise<Response> {
  if (
    request.method !== 'GET' ||
    blocksConditionalDelivery(request) ||
    !TOKEN.test(input.token) ||
    !input.handle ||
    !TOKEN.test(input.handle) ||
    (input.slot !== 'logo' && input.slot !== 'banner')
  )
    return notFound();

  const slot = input.slot;
  try {
    const asset = await dependencies.resolve(input.token, input.handle, slot);
    if (!validAsset(asset, slot)) return notFound();
    const bytes = await dependencies.download(asset, {
      token: input.token,
      handle: input.handle,
      slot,
    });
    if (
      !bytes ||
      bytes.byteLength !== asset.byteSize ||
      !sniffed(bytes, asset.contentType)
    )
      return notFound();

    // The link may be consumed or its published version replaced while Storage
    // returns bytes. Re-resolve before emitting any part of the response.
    const current = await dependencies.resolve(input.token, input.handle, slot);
    if (
      !validAsset(current, slot) ||
      current.bucket !== asset.bucket ||
      current.object !== asset.object ||
      current.contentType !== asset.contentType ||
      current.byteSize !== asset.byteSize
    )
      return notFound();

    return new Response(bytes.slice().buffer as ArrayBuffer, {
      status: 200,
      headers: {
        ...privacyHeaders,
        'Content-Type': asset.contentType,
        'Content-Length': String(bytes.byteLength),
      },
    });
  } catch {
    return notFound();
  }
}
