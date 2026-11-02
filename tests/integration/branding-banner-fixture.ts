import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { validateBrandingImage } from '../../lib/branding/image-validation';
import { brandingValidatedObjectName } from '../../lib/branding/object-path';
import { admin, sql } from './harness';
import {
  registrationFixture,
  secret,
  issue,
} from './registration-links-fixture';
import { credential } from './branding-security-fixture';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type), Buffer.from(data)]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.byteLength);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, sum]);
}

export function bannerPng(width = 316, height = 158): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row += 1) {
    const offset = row * (width * 4 + 1);
    pixels[offset] = 0;
    for (let x = 0; x < width; x += 1) {
      const at = offset + 1 + x * 4;
      pixels[at] = 37;
      pixels[at + 1] = 99;
      pixels[at + 2] = 235;
      pixels[at + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Light artwork near L=0.5 reproduces the former contrast failure in glass mode. */
export function brightBannerPng(): Buffer {
  return readFileSync(
    join(process.cwd(), 'tests/fixtures/registration-hero-bright-artwork.png'),
  );
}

/**
 * Dark artwork with bright local patches.
 *
 * The patches sit under the desktop card text area, the mobile card text
 * area and the desktop preference pill, so an average-only dimming leaves a
 * bright region directly behind white text.
 */
export function brightPatchBannerPng(width = 316, height = 158): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const base = [26, 28, 36];
  const patch = [245, 245, 245];
  const patches = [
    { x0: 175, x1: 270, y0: 5, y1: 45 },
    { x0: 150, x1: 216, y0: 118, y1: 150 },
    { x0: 18, x1: 70, y0: 0, y1: 14 },
  ];
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row += 1) {
    const offset = row * (width * 4 + 1);
    pixels[offset] = 0;
    for (let x = 0; x < width; x += 1) {
      const bright = patches.some(
        (area) =>
          x >= area.x0 && x < area.x1 && row >= area.y0 && row < area.y1,
      );
      const channels = bright ? patch : base;
      const at = offset + 1 + x * 4;
      pixels[at] = channels[0]!;
      pixels[at + 1] = channels[1]!;
      pixels[at + 2] = channels[2]!;
      pixels[at + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Mostly bright artwork with near-black patches behind the hero text.
 *
 * The average stays above the bright tone threshold while the sampled text
 * region still holds dark pixels, which is the case the light theme has to
 * answer with an opaque card.
 */
export function brightWithDarkPatchBannerPng(
  width = 316,
  height = 158,
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const base = [215, 215, 215];
  const patch = [0, 0, 0];
  const patches = [
    { x0: 200, x1: 230, y0: 48, y1: 66 },
    { x0: 165, x1: 195, y0: 126, y1: 142 },
  ];
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row += 1) {
    const offset = row * (width * 4 + 1);
    pixels[offset] = 0;
    for (let x = 0; x < width; x += 1) {
      const dark = patches.some(
        (area) =>
          x >= area.x0 && x < area.x1 && row >= area.y0 && row < area.y1,
      );
      const channels = dark ? patch : base;
      const at = offset + 1 + x * 4;
      pixels[at] = channels[0]!;
      pixels[at + 1] = channels[1]!;
      pixels[at + 2] = channels[2]!;
      pixels[at + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function createPublishedBannerFixture(
  bytes: Buffer = bannerPng(),
) {
  const db = sql();
  const fixture = await registrationFixture();
  const token = secret();
  const issued = await issue(fixture, fixture.po.client, {
    token_hash: token.hash,
  });
  if (issued.error) throw new Error('Registration fixture issuance failed');
  const upload = await fixture.woA.client.rpc('branding_upload_begin', {
    workspace_id: fixture.wsA.id,
    role: 'banner',
    expected_revision: 0,
  });
  if (upload.error || typeof upload.data !== 'string')
    throw new Error('Owner upload initialization failed');
  const uploadId = upload.data;
  const stagingPath = `${fixture.wsA.id}/staging/${uploadId}`;
  const staged = await fixture.woA.client.storage
    .from('branding-staging')
    .upload(stagingPath, bytes, {
      contentType: 'image/png',
      upsert: false,
    });
  if (staged.error) throw new Error('Owner staging upload failed');

  const validator = await credential(db, 'branding_validator');
  const processed = validateBrandingImage(bytes, { role: 'banner' });
  const validatedPath = brandingValidatedObjectName(
    fixture.wsA.id,
    'banner',
    processed.contentHash,
    uploadId,
    processed.mediaType,
  );
  await db.begin(async (tx) => {
    await tx`set local role branding_validator`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(validator.claims)}, true)`;
    await tx`select app_private.branding_validation_prepare(${uploadId})`;
  });
  const promoted = await validator.client.storage
    .from('branding-validated')
    .upload(validatedPath, processed.bytes, {
      contentType: processed.mediaType,
      upsert: false,
    });
  if (promoted.error) throw new Error('Validator promotion failed');
  await db.begin(async (tx) => {
    await tx`set local role branding_validator`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(validator.claims)}, true)`;
    await tx`select app_private.branding_validation_complete(
      ${uploadId}, ${stagingPath}, 'branding-validated', ${validatedPath},
      ${processed.contentHash}, ${processed.bytes.byteLength}, ${processed.mediaType})`;
  });

  const attached = await fixture.woA.client.rpc('branding_asset_attach', {
    upload_id: uploadId,
    expected_revision: 0,
  });
  if (attached.error || attached.data !== 1)
    throw new Error('Validated banner attachment failed');
  const saved = await fixture.woA.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
    fields: {
      name: { ar: 'مركز النخبة', en: 'Elite Center' },
      bannerAlt: { ar: 'لافتة زرقاء', en: 'Blue banner' },
      color: '#2563EB',
    },
  });
  if (saved.error || saved.data !== 2)
    throw new Error('Published banner metadata save failed');
  const published = await fixture.woA.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 2,
  });
  if (published.error) throw new Error('Validated banner publication failed');
  const opened = await fixture.actors.anon.client.rpc(
    'registration_link_open',
    { token: token.token },
  );
  if (
    opened.error ||
    !opened.data?.branding?.banner ||
    !opened.data.render_handle
  ) {
    throw new Error(
      'Published banner did not project through registration open',
    );
  }
  return {
    ...fixture,
    token: token.token,
    renderHandle: opened.data.render_handle as string,
    stagingPath,
    validatedPath,
    processed,
    cleanup: async () => {
      await admin().storage.from('branding-staging').remove([stagingPath]);
      await admin().storage.from('branding-validated').remove([validatedPath]);
      await db.end();
    },
  };
}
