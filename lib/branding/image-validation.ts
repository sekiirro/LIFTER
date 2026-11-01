import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export type BrandingImageRole = 'logo' | 'banner';
export type BrandingMediaType = 'image/png' | 'image/webp';

export type BrandingImageLimits = {
  maxIngressBytes: number;
  maxOutputBytes: number;
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
  maxChunks: number;
};

export type BrandingImageResult = {
  bytes: Uint8Array<ArrayBuffer>;
  contentHash: string;
  height: number;
  mediaType: BrandingMediaType;
  width: number;
};

export const BRANDING_IMAGE_LIMITS: Record<
  BrandingImageRole,
  BrandingImageLimits
> = {
  logo: {
    maxIngressBytes: 4 * 1024 * 1024,
    maxOutputBytes: 4 * 1024 * 1024,
    maxWidth: 2048,
    maxHeight: 2048,
    maxPixels: 1_000_000,
    maxChunks: 96,
  },
  banner: {
    maxIngressBytes: 8 * 1024 * 1024,
    maxOutputBytes: 8 * 1024 * 1024,
    maxWidth: 4096,
    maxHeight: 2048,
    maxPixels: 4_000_000,
    maxChunks: 192,
  },
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const RENDER_REQUIRED_PNG_ANCILLARY = new Set(['tRNS']);
const WEBP_RIFF = [82, 73, 70, 70];
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

function fail(): never {
  throw new Error('Invalid branding image');
}

function checkedLimits(limits: BrandingImageLimits): BrandingImageLimits {
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) fail();
  }
  return limits;
}

function sameBytes(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function checkDimensions(
  width: number,
  height: number,
  limits: BrandingImageLimits,
) {
  if (
    width < 1 ||
    height < 1 ||
    width > limits.maxWidth ||
    height > limits.maxHeight ||
    width * height > limits.maxPixels
  )
    fail();
}

function png(
  bytes: Uint8Array,
  limits: BrandingImageLimits,
): BrandingImageResult {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = 0;
  let sawHeader = false;
  let sawPalette = false;
  let paletteEntries = 0;
  let sawTransparency = false;
  let sawData = false;
  let endedData = false;
  let sawEnd = false;
  let chunksSeen = 0;
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  const idat: Uint8Array[] = [];
  let idatBytes = 0;

  while (offset < bytes.length) {
    if (bytes.length - offset < 12 || ++chunksSeen > limits.maxChunks) fail();
    const length = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset,
      4,
    ).getUint32(0);
    const end = offset + 12 + length;
    if (!Number.isSafeInteger(end) || end > bytes.length) fail();
    const typeAt = offset + 4;
    const dataAt = offset + 8;
    const crcAt = dataAt + length;
    const type = String.fromCharCode(
      bytes[typeAt]!,
      bytes[typeAt + 1]!,
      bytes[typeAt + 2]!,
      bytes[typeAt + 3]!,
    );
    for (let i = 0; i < 4; i += 1) {
      const c = bytes[typeAt + i]!;
      if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) fail();
    }
    if (bytes[typeAt + 2]! >= 97) fail(); // PNG's reserved type bit must be zero.
    let crc = 0xffffffff;
    for (let i = typeAt; i < crcAt; i += 1)
      crc = crcTable[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    if (
      crc !==
      new DataView(bytes.buffer, bytes.byteOffset + crcAt, 4).getUint32(0)
    )
      fail();

    const data = bytes.subarray(dataAt, crcAt);
    if (!sawHeader && type !== 'IHDR') fail();
    if (sawEnd) fail();
    if (type === 'IHDR') {
      if (sawHeader || length !== 13) fail();
      width = new DataView(data.buffer, data.byteOffset, 4).getUint32(0);
      height = new DataView(data.buffer, data.byteOffset + 4, 4).getUint32(0);
      bitDepth = data[8]!;
      colorType = data[9]!;
      const validDepths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !validDepths[colorType]?.includes(bitDepth) ||
        data[10] !== 0 ||
        data[11] !== 0 ||
        data[12] !== 0
      )
        fail();
      checkDimensions(width, height, limits);
      sawHeader = true;
      kept.push(bytes.subarray(offset, end));
    } else if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') {
      fail();
    } else if (type === 'PLTE') {
      if (
        sawPalette ||
        sawData ||
        length === 0 ||
        length > 768 ||
        length % 3 !== 0 ||
        colorType === 0 ||
        colorType === 4
      )
        fail();
      sawPalette = true;
      paletteEntries = length / 3;
      if (colorType === 3 && paletteEntries > 2 ** bitDepth) fail();
      kept.push(bytes.subarray(offset, end));
    } else if (RENDER_REQUIRED_PNG_ANCILLARY.has(type)) {
      if (sawTransparency || sawData) fail();
      if (
        (colorType === 3 &&
          (!sawPalette || length < 1 || length > paletteEntries)) ||
        (colorType === 0 && length !== 2) ||
        (colorType === 2 && length !== 6) ||
        colorType === 4 ||
        colorType === 6
      )
        fail();
      sawTransparency = true;
      kept.push(bytes.subarray(offset, end));
    } else if (type === 'IDAT') {
      if (
        endedData ||
        (colorType === 3 && !sawPalette) ||
        idatBytes + length > limits.maxIngressBytes
      )
        fail();
      sawData = true;
      idatBytes += length;
      idat.push(data);
      kept.push(bytes.subarray(offset, end));
    } else if (type === 'IEND') {
      if (length !== 0 || !sawData || sawEnd) fail();
      if (colorType === 3 && !sawPalette) fail();
      sawEnd = true;
      kept.push(bytes.subarray(offset, end));
    } else {
      if (sawData) endedData = true;
      // tRNS is the only render-required ancillary chunk. All other ancillary
      // chunks are stripped, including text, timestamps, and EXIF metadata.
      if ((bytes[typeAt]! & 0x20) === 0) fail(); // Unknown critical chunks are not safe to discard.
    }
    if (type !== 'IDAT' && sawData && type !== 'IEND') endedData = true;
    offset = end;
  }
  if (!sawEnd || offset !== bytes.length) fail();

  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const rowBytes = Math.ceil((width * channels[colorType]! * bitDepth) / 8);
  const expectedInflated = (rowBytes + 1) * height;
  const compressed = Buffer.concat(idat, idatBytes);
  let inflated: Buffer;
  try {
    const result = inflateSync(compressed, {
      maxOutputLength: expectedInflated + 1,
      info: true,
    }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
    if (result.engine.bytesWritten !== compressed.length) fail();
    inflated = result.buffer;
  } catch {
    return fail();
  }
  if (inflated.length !== expectedInflated) fail();
  for (let row = 0; row < height; row += 1)
    if (inflated[row * (rowBytes + 1)]! > 4) fail();

  return result(bytes, kept, limits.maxOutputBytes, width, height, 'image/png');
}

function webp(
  bytes: Uint8Array,
  limits: BrandingImageLimits,
): BrandingImageResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 20 ||
    !sameBytes(bytes, WEBP_RIFF) ||
    view.getUint32(4, true) + 8 !== bytes.length ||
    !sameBytes(bytes.subarray(8), [87, 69, 66, 80])
  )
    fail();
  const kept: Uint8Array[] = [bytes.subarray(0, 12)];
  let offset = 12;
  let chunks = 0;
  let width = 0;
  let height = 0;
  let extended = false;
  let sawImage = false;
  let sawMetadata = false;
  let vp8xChunk: Uint8Array | undefined;
  let imageKind = '';
  const retained: Uint8Array[] = [];
  while (offset < bytes.length) {
    if (bytes.length - offset < 8 || ++chunks > limits.maxChunks) fail();
    const type = String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!,
    );
    const length = view.getUint32(offset + 4, true);
    const padded = length + (length & 1);
    const end = offset + 8 + padded;
    if (!Number.isSafeInteger(end) || end > bytes.length) fail();
    if (length & 1 && bytes[offset + 8 + length] !== 0) fail();
    const chunk = bytes.subarray(offset, end);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'VP8X') {
      if (
        offset !== 12 ||
        vp8xChunk ||
        length !== 10 ||
        data[0]! & 0xc1 ||
        data[1] !== 0 ||
        data[2] !== 0 ||
        data[3] !== 0 ||
        data[0]! & 0x02
      )
        fail();
      extended = true;
      vp8xChunk = chunk;
      width = 1 + data[4]! + (data[5]! << 8) + (data[6]! << 16);
      height = 1 + data[7]! + (data[8]! << 8) + (data[9]! << 16);
      checkDimensions(width, height, limits);
    } else if (type === 'ANIM' || type === 'ANMF') {
      fail();
    } else if (type === 'EXIF' || type === 'XMP ' || type === 'ICCP') {
      if (!extended || (type === 'ICCP' && sawImage)) fail();
      sawMetadata = true;
    } else if (type === 'ALPH') {
      if (!extended || sawImage || !data.length) fail();
      retained.push(chunk);
    } else if (type === 'VP8 ' || type === 'VP8L') {
      if (
        sawImage ||
        (type === 'VP8L' && data.length < 5) ||
        (type === 'VP8 ' && data.length < 10)
      )
        fail();
      sawImage = true;
      imageKind = type;
      if (type === 'VP8L') {
        if (data[0] !== 0x2f || (data[4]! & 0xe0) !== 0) fail();
        width = 1 + data[1]! + ((data[2]! & 0x3f) << 8);
        height =
          1 + (data[2]! >> 6) + (data[3]! << 2) + ((data[4]! & 0x0f) << 10);
      } else {
        const frameTag = data[0]! | (data[1]! << 8) | (data[2]! << 16);
        if (
          (frameTag & 1) !== 0 ||
          ((frameTag >>> 1) & 7) > 3 ||
          ((frameTag >>> 4) & 1) !== 1 ||
          data[3] !== 0x9d ||
          data[4] !== 0x01 ||
          data[5] !== 0x2a
        )
          fail();
        width =
          new DataView(data.buffer, data.byteOffset + 6, 2).getUint16(0, true) &
          0x3fff;
        height =
          new DataView(data.buffer, data.byteOffset + 8, 2).getUint16(0, true) &
          0x3fff;
      }
      checkDimensions(width, height, limits);
      retained.push(chunk);
    } else {
      fail();
    }
    offset = end;
  }
  if (!sawImage || offset !== bytes.length || (extended && !vp8xChunk)) fail();
  if (extended) {
    if (
      imageKind === 'VP8L' &&
      retained.some(
        (chunk) => String.fromCharCode(...chunk.subarray(0, 4)) === 'ALPH',
      )
    )
      fail();
    const declaredWidth =
      1 + vp8xChunk![12]! + (vp8xChunk![13]! << 8) + (vp8xChunk![14]! << 16);
    const declaredHeight =
      1 + vp8xChunk![15]! + (vp8xChunk![16]! << 8) + (vp8xChunk![17]! << 16);
    if (width !== declaredWidth || height !== declaredHeight) fail();
    if (sawMetadata) {
      const cleanExtended = Buffer.from(vp8xChunk!);
      cleanExtended[8] = cleanExtended[8]! & ~0x2c;
      kept.push(cleanExtended);
    } else kept.push(vp8xChunk!);
  }
  kept.push(...retained);
  return result(
    bytes,
    kept,
    limits.maxOutputBytes,
    width,
    height,
    'image/webp',
  );
}

function result(
  input: Uint8Array,
  chunks: Uint8Array[],
  maxOutputBytes: number,
  width: number,
  height: number,
  mediaType: BrandingMediaType,
): BrandingImageResult {
  const outputLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (outputLength > maxOutputBytes) fail();
  const output = Buffer.concat(
    chunks.map((chunk) =>
      Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength),
    ),
    outputLength,
  );
  if (mediaType === 'image/webp') output.writeUInt32LE(output.length - 8, 4);
  return {
    bytes: output,
    contentHash: createHash('sha256').update(output).digest('hex'),
    height,
    mediaType,
    width,
  };
}

export function validateBrandingImage(
  input: Uint8Array,
  options: { role: BrandingImageRole; limits?: BrandingImageLimits },
): BrandingImageResult {
  const limits = checkedLimits(
    options.limits ?? BRANDING_IMAGE_LIMITS[options.role],
  );
  if (
    !(input instanceof Uint8Array) ||
    input.byteLength > limits.maxIngressBytes ||
    input.byteLength < 12
  )
    fail();
  if (PNG_SIGNATURE.every((byte, index) => input[index] === byte))
    return png(input, limits);
  if (sameBytes(input.subarray(0, 4), WEBP_RIFF)) return webp(input, limits);
  return fail();
}
