# LIFTER — Accepted Security Exceptions

| ID | Advisory | Severity | Accepted | Review by |
|---|---|---|---|---|
| SE-001 | [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2): `glob` CLI command injection via `-c/--cmd` | high (×4 in `npm audit`, one root cause) | 2026-10-27, PO approval on PR #1 | Before P0 exit (F8), or on any `@opennextjs/cloudflare` upgrade |

## SE-001 details

- **Dependency chain (dev-only):** `@opennextjs/cloudflare@1.20.13` → `@opennextjs/aws@4.1.12` → `@node-minify/core@9.0.2` → `glob@10.3.3`. npm reports the four packages in this chain as four findings.
- **Actual exposure:** The flaw is in glob's *command-line tool* (`glob -c <cmd>`, which runs with `shell: true`). LIFTER never invokes the glob CLI. `@node-minify/core` uses glob only as a library, during the local/CI edge build. The deployed Worker doesn't contain it: it is a devDependency, and the CLI isn't bundled. Runtime and production exposure: **none**. Build-time exposure: only if an attacker could already pass arguments to a glob CLI invocation in CI, which no script does.
- **Why not `npm audit fix --force`:** it downgrades `@opennextjs/cloudflare` to 1.20.9 (flagged as semver-major), reverting adapter fixes.
- **Remediation plan:**
  1. A chore PR adds an npm `overrides` entry pinning `@node-minify/core`'s glob to a patched release (≥ 10.5.0). Verify `build:edge` + `size` in CI.
  2. Otherwise, upgrade `@opennextjs/cloudflare` when upstream ships a patched `@opennextjs/aws`.
  3. Re-run `npm audit` at every P0 feature review. Close this exception when audit shows 0 high.
