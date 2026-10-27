# Implementation Plan: Encrypted Backups & Restore Test (P0-F7)

**Branch**: `007-backups` (from `main`, independent of the stack) | **Spec**: [spec.md](spec.md)

## Summary

This feature adds Node ESM operator scripts in `scripts/backup/`:

- `keygen.mjs`
- `backup.mjs`
- `restore-test.mjs`
- `lib/*.mjs`, pure and unit-tested

They use the pinned Supabase CLI (`npx supabase@2.122.0`) for dumps, `age-encryption` for streaming encryption, `postgres` for verification queries, and `docker exec` with `psql` inside the isolated restore stack's DB container for restores. This follows the Supabase CLI backup/restore procedure: roles → schema → `SET session_replication_role = replica` → data, in a single transaction with `ON_ERROR_STOP`.

## Technical Context

- **Runtime**: Node 24.
- **New dependencies (exact)**: `age-encryption@0.3.1` (BSD-3-Clause, devDependency, operator tooling only) and `postgres@3.4.9` (devDependency, already used by F3 on another branch).
- **Restore target**: a temporary Supabase workdir in the OS temp folder with `project_id = "lifter-restore"` and every port shifted by +1000. `supabase start --workdir <tmp>` without migrations, then the dumps are applied. Afterwards `supabase stop --no-backup --workdir <tmp>` and the temp folder is deleted.
- **Testing**: unit tests (`tests/unit/backup-*.test.ts`) for retention, manifest building/verification, checksum comparison, CLI arg parsing and log redaction. The end-to-end test is run by the reviewer (Docker).

## Design

- **Dump.** `supabase db dump --db-url <url>` three times: `--role-only`, default (schema) and `--data-only --use-copy`. Stdout is piped into the age `Encrypter` stream, then to the file `<id>/{roles,schema,data}.sql.age`, so nothing is written in plaintext. stderr is captured and passed through a redaction filter that strips URLs and passwords.
- **Checks.** Connect with `postgres(url)`. For every table in non-system schemas, excluding `pg_*`, `information_schema`, Supabase-managed schemas other than `auth.users`, `storage`, `realtime`, `supabase_*`, `extensions`, `graphql*`, `vault`, `pgsodium*`, `net`, `cron` and `_realtime`, compute `count(*)` and `md5(coalesce(string_agg(md5(t::text), '' order by md5(t::text)), ''))`. Order-independent. Also `auth.users` (count + checksum of `id` only). Encrypt to `checks.json.age`.
- **Manifest.** `manifest.json` = `{ format: 1, id, created_at, cli: '2.122.0', files: { name: sha256 } }`. Written last, and its presence marks the backup complete. Folders without a manifest are treated as incomplete and pruned.
- **Retention.** `selectRetained(ids: Date[], now)` returns the set to keep, using UTC calendar days, ISO weeks and months as in the spec.
- **Restore test.**
  1. Verify the manifest hashes.
  2. Decrypt the files to memory buffers.
  3. Create the temp workdir with `supabase/config.toml` (copied from the repo with project_id and ports rewritten).
  4. `supabase start -x <same exclusions as CI>`.
  5. `docker exec -i supabase_db_lifter-restore psql -v ON_ERROR_STOP=1 --single-transaction -U postgres -d postgres`, with stdin = roles + schema + `SET session_replication_role = replica;` + data.
  6. Recompute the checks against the restore stack's DB_URL and compare (an exact equality map).
  7. Smoke query: `select count(*) from information_schema.tables where table_schema='public'` > 0, or the manifest says there are no public tables.
  8. Append `<iso>\t<id>\tPASS|FAIL\t<code>` to `<backup-root>/restore-tests.log`.
  9. Tear down in `finally`.

  Exit codes: 0 PASS, 1 FAIL, 2 usage.
- **Keygen.** `keygen.mjs --out <path>` writes the identity, refusing to overwrite, and prints only the public recipient.
- **Scripts.** `backup`, `backup:restore-test` and `backup:keygen` in package.json.
- **Gitignore.** `backups/`, `*.age`, `age-identity*.txt`.

## Constitution Check

| Principle | Status |
|---|---|
| VII Privacy | Encryption before disk. The private key stays offline. Logs are redacted. ✅ |
| Platform (D-14, restore gate) | Delivers the backup and the restore test. $0. ✅ |
| IV Scope | Exactly D-14 and the Architecture design. Nothing deployed or scheduled automatically. ✅ |

## NEEDS DECISION

- ND-F7-1: The backup folder location on the PO machine, and the key custody procedure. Documented as operator inputs.
- ND-F7-2: The first real backup and restore drill against staging. Needs a staging project, which is a deploy-time PO approval.

## Structure

```text
scripts/backup/{keygen,backup,restore-test}.mjs
scripts/backup/lib/{retention,manifest,checks,redact,args,exec}.mjs
tests/unit/backup-retention.test.ts  backup-manifest.test.ts  backup-checks.test.ts  backup-redact.test.ts
README.md "Backups & restore test"
```
