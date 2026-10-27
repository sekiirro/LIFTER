import { afterEach, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildManifest,
  verifyManifest,
  FILES,
} from '../../scripts/backup/lib/manifest.mjs';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'backup test '));
  roots.push(root);
  const id = '2026-10-27T12-00-00-000Z';
  const folder = join(root, id);
  const { mkdir } = await import('node:fs/promises');
  await mkdir(folder);
  for (const name of FILES)
    await writeFile(join(folder, name), Buffer.alloc(150000, 42));
  const manifest = await buildManifest(folder, id, '2026-10-27T12:00:00.000Z');
  await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest));
  return { folder, manifest };
}
it('builds streaming SHA-256 hashes and verifies all required files', async () => {
  const { folder, manifest } = await fixture();
  expect(manifest.files[FILES[0]!]).toBe(
    createHash('sha256').update(Buffer.alloc(150000, 42)).digest('hex'),
  );
  expect(await verifyManifest(folder)).toEqual(manifest);
});
it('rejects one-byte tampering before any decryption', async () => {
  const { folder } = await fixture();
  const path = join(folder, FILES[0]!);
  const bytes = await readFile(path);
  bytes[100] = 43;
  await writeFile(path, bytes);
  await expect(verifyManifest(folder)).rejects.toThrow('HASH_MISMATCH');
});
it('rejects unsupported formats, missing files and path traversal', async () => {
  const { folder, manifest } = await fixture();
  for (const changed of [
    { ...manifest, format: 2 },
    { ...manifest, files: {} },
    { ...manifest, files: { ...manifest.files, '../outside': 'a'.repeat(64) } },
  ]) {
    await writeFile(join(folder, 'manifest.json'), JSON.stringify(changed));
    await expect(verifyManifest(folder)).rejects.toThrow('MANIFEST_INVALID');
  }
});
