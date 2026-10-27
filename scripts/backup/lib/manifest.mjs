import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, lstat } from 'node:fs/promises';
import { join, basename } from 'node:path';

export const FILES = [
  'roles.sql.age',
  'schema.sql.age',
  'data.sql.age',
  'checks.json.age',
];
export const CLI_VERSION = '2.122.0';
export async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function buildManifest(folder, id, createdAt) {
  const files = {};
  for (const name of FILES) files[name] = await sha256(join(folder, name));
  return { format: 1, id, created_at: createdAt, cli: CLI_VERSION, files };
}
export async function verifyManifest(folder) {
  const manifest = JSON.parse(
    await readFile(join(folder, 'manifest.json'), 'utf8'),
  );
  if (
    manifest.format !== 1 ||
    manifest.cli !== CLI_VERSION ||
    manifest.id !== basename(folder) ||
    !/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z$/.test(manifest.id) ||
    !Number.isFinite(Date.parse(manifest.created_at)) ||
    !manifest.files ||
    Object.keys(manifest.files).sort().join() !== [...FILES].sort().join()
  )
    throw new Error('MANIFEST_INVALID');
  for (const name of FILES) {
    if (
      !(await lstat(join(folder, name))).isFile() ||
      !/^[a-f0-9]{64}$/.test(manifest.files[name]) ||
      (await sha256(join(folder, name))) !== manifest.files[name]
    )
      throw new Error('HASH_MISMATCH');
  }
  return manifest;
}
