import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  BRANDING_IMAGE_LIMITS,
  validateBrandingImage,
} from '../../lib/branding/image-validation';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const LIMITS = {
  maxIngressBytes: 4096,
  maxOutputBytes: 4096,
  maxWidth: 64,
  maxHeight: 64,
  maxPixels: 1024,
  maxChunks: 24,
};

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBytes, Buffer.from(data)]);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([header, body, checksum]);
}

function pngFixture(
  options: {
    width?: number;
    height?: number;
    metadata?: boolean;
    animation?: boolean;
    corruptCrc?: boolean;
    corruptIdatCrc?: boolean;
    chunks?: number;
    trailing?: boolean;
    inflateTrailing?: boolean;
  } = {},
): Buffer {
  const width = options.width ?? 1;
  const height = options.height ?? 1;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunks = [pngChunk('IHDR', ihdr)];
  if (options.animation) chunks.push(pngChunk('acTL', Buffer.alloc(8)));
  if (options.metadata)
    chunks.push(pngChunk('tEXt', Buffer.from('Comment\0private')));
  for (let index = 0; index < (options.chunks ?? 0); index += 1) {
    chunks.push(pngChunk('tEXt', Buffer.from(`k${index}\0v`)));
  }
  const pixels = Buffer.alloc(width * height * 4 + height);
  for (let row = 0; row < height; row += 1) pixels[row * (width * 4 + 1)] = 0;
  const compressed = deflateSync(pixels);
  chunks.push(
    pngChunk(
      'IDAT',
      options.inflateTrailing
        ? Buffer.concat([compressed, Buffer.from([0xde, 0xad])])
        : compressed,
    ),
  );
  chunks.push(pngChunk('IEND', Buffer.alloc(0)));
  if (options.corruptCrc) {
    const target = chunks[1]!;
    target[target.length - 1] = target[target.length - 1]! ^ 0xff;
  }
  if (options.corruptIdatCrc) {
    const target = chunks[chunks.length - 2]!;
    target[target.length - 1] = target[target.length - 1]! ^ 0xff;
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    ...chunks,
    ...(options.trailing ? [Buffer.from([0xde, 0xad])] : []),
  ]);
}

function webpChunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32LE(data.length);
  return Buffer.concat([
    Buffer.from(type, 'ascii'),
    length,
    Buffer.from(data),
    ...(data.length % 2 ? [Buffer.from([0])] : []),
  ]);
}

function webpFixture(
  options: {
    metadata?: boolean;
    animation?: boolean;
    badRiffSize?: boolean;
    truncate?: boolean;
    badFrameHeader?: boolean;
    mismatchedDimensions?: boolean;
    extraChunks?: number;
  } = {},
): Buffer {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = options.animation ? 0x02 : options.metadata ? 0x0c : 0;
  vp8x.writeUIntLE(0, 4, 3);
  vp8x.writeUIntLE(0, 7, 3);
  const chunks = [webpChunk('VP8X', vp8x)];
  if (options.metadata) {
    chunks.push(webpChunk('EXIF', Buffer.from('Exif\0\0metadata')));
    chunks.push(webpChunk('XMP ', Buffer.from('<x:xmpmeta/>')));
  }
  if (options.animation) {
    chunks.push(webpChunk('ANIM', Buffer.alloc(6)));
    chunks.push(webpChunk('ANMF', Buffer.alloc(16)));
  } else {
    const frame = Buffer.from([
      0x10,
      0,
      0,
      0x9d,
      0x01,
      0x2a,
      options.mismatchedDimensions ? 2 : 1,
      0,
      1,
      0,
    ]);
    if (options.badFrameHeader) frame[3] = 0;
    chunks.push(webpChunk('VP8 ', frame));
  }
  for (let index = 0; index < (options.extraChunks ?? 0); index += 1)
    chunks.push(webpChunk('XMP ', Buffer.from('x')));
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(body.length + (options.badRiffSize ? 1 : 0));
  const result = Buffer.concat([Buffer.from('RIFF'), riffSize, body]);
  return options.truncate ? result.subarray(0, result.length - 2) : result;
}

function validate(bytes: Uint8Array) {
  return validateBrandingImage(bytes, { role: 'logo', limits: LIMITS });
}

describe('branding image validation contract', () => {
  it('keeps proposed F14 desktop and mobile hero art inside the existing banner limits', () => {
    const limits = BRANDING_IMAGE_LIMITS.banner;
    for (const size of [
      { width: 2560, height: 1440 },
      { width: 1080, height: 1440 },
    ]) {
      expect(size.width).toBeLessThanOrEqual(limits.maxWidth);
      expect(size.height).toBeLessThanOrEqual(limits.maxHeight);
      expect(size.width * size.height).toBeLessThanOrEqual(limits.maxPixels);
    }
  });

  it('uses separately benchmarked role caps', () => {
    expect(BRANDING_IMAGE_LIMITS.logo).toEqual({
      maxIngressBytes: 4 * 1024 * 1024,
      maxOutputBytes: 4 * 1024 * 1024,
      maxWidth: 2048,
      maxHeight: 2048,
      maxPixels: 1_000_000,
      maxChunks: 96,
    });
    expect(BRANDING_IMAGE_LIMITS.banner).toEqual({
      maxIngressBytes: 8 * 1024 * 1024,
      maxOutputBytes: 8 * 1024 * 1024,
      maxWidth: 4096,
      maxHeight: 2048,
      maxPixels: 4_000_000,
      maxChunks: 192,
    });
  });

  it('accepts the recommended 1600 by 800 banner without changing banner limits', () => {
    const result = validateBrandingImage(
      pngFixture({ width: 1600, height: 800 }),
      {
        role: 'banner',
      },
    );

    expect(result).toMatchObject({ width: 1600, height: 800 });
    expect(BRANDING_IMAGE_LIMITS.banner).toEqual({
      maxIngressBytes: 8 * 1024 * 1024,
      maxOutputBytes: 8 * 1024 * 1024,
      maxWidth: 4096,
      maxHeight: 2048,
      maxPixels: 4_000_000,
      maxChunks: 192,
    });
  });

  it('walks PNG structure, strips metadata, reports dimensions and hashes output bytes', () => {
    const withMetadata = pngFixture({ metadata: true });
    const expected = pngFixture();
    const result = validate(withMetadata);

    expect(Buffer.from(result.bytes)).toEqual(expected);
    expect(result.bytes).not.toContain(Buffer.from('private'));
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(result.mediaType).toBe('image/png');
    expect(result.contentHash).toBe(
      createHash('sha256').update(expected).digest('hex'),
    );
  });

  it('walks WebP RIFF chunks, removes metadata flags/chunks and hashes stripped bytes', () => {
    const withMetadata = webpFixture({ metadata: true });
    const expected = webpFixture();
    const result = validate(withMetadata);
    const normalized = Buffer.from(result.bytes);

    expect(normalized).toEqual(expected);
    expect(normalized.includes(Buffer.from('EXIF'))).toBe(false);
    expect(normalized.includes(Buffer.from('XMP '))).toBe(false);
    expect(normalized[20]! & 0x0c).toBe(0);
    expect(result.mediaType).toBe('image/webp');
    expect(result.contentHash).toBe(
      createHash('sha256').update(expected).digest('hex'),
    );
  });

  it('rejects invalid magic, unsupported formats and SVG', () => {
    expect(() => validate(Buffer.from('not an image'))).toThrow();
    expect(() => validate(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toThrow();
    expect(() =>
      validate(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toThrow();
  });

  it('rejects bad PNG CRC, truncated chunks and trailing data', () => {
    expect(() => validate(pngFixture({ corruptCrc: true }))).toThrow();
    expect(() => validate(pngFixture({ corruptIdatCrc: true }))).toThrow();
    expect(() => validate(pngFixture().subarray(0, -5))).toThrow();
    expect(() => validate(pngFixture({ trailing: true }))).toThrow();
    expect(() => validate(pngFixture({ inflateTrailing: true }))).toThrow();
  });

  it('rejects bad WebP RIFF bounds, truncation and trailing bytes', () => {
    expect(() => validate(webpFixture({ badRiffSize: true }))).toThrow();
    expect(() => validate(webpFixture({ truncate: true }))).toThrow();
    expect(() =>
      validate(Buffer.concat([webpFixture(), Buffer.from([1])])),
    ).toThrow();
  });

  it('rejects malformed WebP frame headers, inconsistent dimensions and complexity', () => {
    expect(() => validate(webpFixture({ badFrameHeader: true }))).toThrow();
    expect(() =>
      validate(webpFixture({ mismatchedDimensions: true })),
    ).toThrow();
    expect(() => validate(webpFixture({ extraChunks: 24 }))).toThrow();
  });

  it('rejects dimensions and pixel counts over the supplied role limit', () => {
    expect(() => validate(pngFixture({ width: 65 }))).toThrow();
    expect(() => validate(pngFixture({ width: 64, height: 64 }))).toThrow();
  });

  it('rejects APNG and animated WebP structures', () => {
    expect(() => validate(pngFixture({ animation: true }))).toThrow();
    expect(() => validate(webpFixture({ animation: true }))).toThrow();
  });

  it('rejects excessive container complexity and ingress bytes', () => {
    expect(() => validate(pngFixture({ chunks: 30 }))).toThrow();
    expect(() => validate(Buffer.alloc(LIMITS.maxIngressBytes + 1))).toThrow();
  });
});
