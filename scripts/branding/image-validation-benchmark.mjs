import { performance } from 'node:perf_hooks';
import { deflateSync } from 'node:zlib';
import {
  BRANDING_IMAGE_LIMITS,
  validateBrandingImage,
} from '../../lib/branding/image-validation.ts';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let value = i;
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[i] = value >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type);
  const crcInput = Buffer.concat([typeBytes, data]);
  let crc = 0xffffffff;
  for (const byte of crcInput)
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, crcInput, checksum]);
}

function png(width, height, metadataLength = 0, metadataChunks = 0) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 16;
  ihdr[9] = 6;
  const rows = Buffer.alloc((width * 8 + 1) * height);
  const chunks = [signature, chunk('IHDR', ihdr)];
  if (metadataLength) {
    const metadata = Buffer.alloc(metadataLength);
    metadata[0] = 107;
    metadata[1] = 0;
    chunks.push(chunk('tEXt', metadata));
  }
  for (let i = 0; i < metadataChunks; i += 1)
    chunks.push(chunk('tEXt', Buffer.from([107, 0])));
  chunks.push(chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function webp(size) {
  const ext = Buffer.concat([
    Buffer.from('VP8X'),
    Buffer.from([10, 0, 0, 0]),
    Buffer.alloc(10),
  ]);
  const payload = Buffer.alloc(size - 38);
  payload.set([0x10, 0, 0, 0x9d, 0x01, 0x2a, 1, 0, 1, 0]);
  const frame = Buffer.concat([
    Buffer.from('VP8 '),
    Buffer.from([
      payload.length & 255,
      (payload.length >>> 8) & 255,
      (payload.length >>> 16) & 255,
      (payload.length >>> 24) & 255,
    ]),
    payload,
  ]);
  const body = Buffer.concat([Buffer.from('WEBP'), ext, frame]);
  const header = Buffer.alloc(8);
  header.write('RIFF');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function measure(label, input, role) {
  const beforePeak = process.resourceUsage().maxRSS;
  validateBrandingImage(input, { role });
  validateBrandingImage(input, { role });
  const times = [];
  for (let i = 0; i < 7; i += 1) {
    const start = performance.now();
    validateBrandingImage(input, { role });
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const afterPeak = process.resourceUsage().maxRSS;
  console.log(
    JSON.stringify({
      label,
      role,
      ingressBytes: input.length,
      medianMs: Number(times[3].toFixed(2)),
      slowestOfSevenMs: Number(times[6].toFixed(2)),
      incrementalRssHighWaterMiB: Number(
        ((afterPeak - beforePeak) / 1024).toFixed(1),
      ),
    }),
  );
}

const logo = BRANDING_IMAGE_LIMITS.logo;
const banner = BRANDING_IMAGE_LIMITS.banner;
const cases = [
  ['logo metadata CRC walk', png(1, 1, logo.maxIngressBytes - 82), 'logo'],
  ['logo maximum chunk complexity', png(1, 1, 0, logo.maxChunks - 3), 'logo'],
  ['logo retained output and hash', webp(logo.maxIngressBytes), 'logo'],
  ['logo max pixel expansion', png(1000, 1000), 'logo'],
  [
    'banner metadata CRC walk',
    png(1, 1, banner.maxIngressBytes - 82),
    'banner',
  ],
  [
    'banner maximum chunk complexity',
    png(1, 1, 0, banner.maxChunks - 3),
    'banner',
  ],
  ['banner retained output and hash', webp(banner.maxIngressBytes), 'banner'],
  ['banner max pixel expansion', png(2000, 2000), 'banner'],
];

for (const [label, input, role] of cases) measure(label, input, role);
