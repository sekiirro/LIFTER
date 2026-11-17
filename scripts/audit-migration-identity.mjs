// T053 (F9 FR-022/FR-028, SC-013/SC-019, S32-R1): prove migration version identity
// is unique across ALL origin refs, and that migrations touching package tables are
// byte-identical (same git blob) on every ref that carries them (never edited once pushed).
// Read-only: only `git for-each-ref` and `git ls-tree`. Run `git fetch --prune origin` first.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseOriginRemoteRefs } from './check-migration-timestamps.mjs';

const execFileAsync = promisify(execFile);

// Parses `git ls-tree -r -z <ref> -- supabase/migrations` ("<mode> blob <oid>\t<path>\0").
export function parseLsTreeEntries(out) {
  return out
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf('\t');
      const meta = entry.slice(0, tab).split(' ');
      return { oid: meta[2], name: path.posix.basename(entry.slice(tab + 1)) };
    })
    .filter((e) => e.name.endsWith('.sql'));
}

export function analyzeIdentity(refEntries) {
  const byVersion = new Map();
  for (const { ref, entries } of refEntries) {
    for (const { name, oid } of entries) {
      const m = /^(\d{14})_.+\.sql$/.exec(name);
      if (!m) continue;
      const files = byVersion.get(m[1]) ?? new Map();
      const oids = files.get(name) ?? new Map();
      const refs = oids.get(oid) ?? new Set();
      refs.add(ref);
      oids.set(oid, refs);
      files.set(name, oids);
      byVersion.set(m[1], files);
    }
  }
  const duplicateVersions = [];
  const divergentContent = [];
  for (const [version, files] of byVersion) {
    if (files.size > 1)
      duplicateVersions.push({ version, filenames: [...files.keys()].sort() });
    for (const [name, oids] of files)
      if (oids.size > 1)
        divergentContent.push({
          name,
          blobs: [...oids].map(([oid, refs]) => ({
            oid,
            refs: [...refs].sort(),
          })),
        });
  }
  return {
    versionCount: byVersion.size,
    refCount: refEntries.length,
    duplicateVersions: duplicateVersions.sort((a, b) =>
      a.version.localeCompare(b.version),
    ),
    divergentContent: divergentContent.sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  };
}

async function git(args) {
  return (await execFileAsync('git', args, { maxBuffer: 1 << 28 })).stdout;
}

export async function listAllOriginRefEntries() {
  const refs = parseOriginRemoteRefs(
    await git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin']),
  );
  const out = [];
  for (const ref of refs)
    out.push({
      ref,
      entries: parseLsTreeEntries(
        await git(['ls-tree', '-r', '-z', ref, '--', 'supabase/migrations']),
      ),
    });
  return out;
}

async function main() {
  const report = analyzeIdentity(await listAllOriginRefEntries());
  console.log(
    `refs=${report.refCount} distinct_versions=${report.versionCount} duplicate_versions=${report.duplicateVersions.length}`,
  );
  for (const d of report.duplicateVersions)
    console.error(`DUPLICATE ${d.version}: ${d.filenames.join(' | ')}`);
  const only = process.argv.find((a) => a.startsWith('--content-of='));
  const names = only ? only.slice(13).split(',') : null;
  for (const d of report.divergentContent)
    if (!names || names.includes(d.name))
      console.error(
        `DIVERGENT-CONTENT ${d.name}: ${d.blobs.map((b) => `${b.oid.slice(0, 10)}@${b.refs.length}refs`).join(' vs ')}`,
      );
  const divergentFiltered = report.divergentContent.filter(
    (d) => !names || names.includes(d.name),
  );
  if (report.duplicateVersions.length || divergentFiltered.length)
    process.exitCode = 1;
  else console.log('OK: version identity unique across all origin refs');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await main();
