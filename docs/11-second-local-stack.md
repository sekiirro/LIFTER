# Isolated local Supabase Stack D

Stack D is the F15 local database target. Its project ID is `lifter-stack-d`; its complete configured service port block is `45420–45429`:

| Service                |  Port |
| ---------------------- | ----: |
| Database shadow        | 45420 |
| API / Kong             | 45421 |
| Database               | 45422 |
| Studio                 | 45423 |
| Mailpit UI             | 45424 |
| Mailpit SMTP           | 45425 |
| Mailpit POP3           | 45426 |
| Analytics              | 45427 |
| Edge runtime inspector | 45428 |
| Pooler                 | 45429 |

The API, database, shadow database, Studio, Mailpit, analytics, edge inspector, and pooler ports are configured separately from Stacks A, B, and C. Storage is enabled and its API is exposed through the D API/Kong port `45421`; Supabase config does not allocate a separate host port for Storage. Mailpit and Auth are project-scoped to `lifter-stack-d`. `supabase-stack-d/supabase/migrations` is a Windows junction to the branch's root `supabase/migrations` directory; it resolves to the shared migration source and does not duplicate migration files.

On a fresh checkout, create the junction from the repository root after confirming the link path does not already exist:

```powershell
$migrationLink = "supabase-stack-d/supabase/migrations"
if (Test-Path -LiteralPath $migrationLink) {
  throw "Migration path already exists; inspect it before proceeding."
}
New-Item -ItemType Junction -Path $migrationLink -Target (Resolve-Path "supabase/migrations")
```

Select D with `LIFTER_SUPABASE_STACK=d`. Its configuration and all Supabase CLI commands use the absolute `supabase-stack-d` workdir. Before each Docker, Supabase CLI, or psql operation, perform a read-only ownership check against the expected project ID and ports. Never print raw `supabase status` or environment output; if status data is needed, parse filtered JSON in memory and redact keys.

Stack-aware Vault provisioner history must be reconciled at merge: this branch ports the F13 version from commit `afd5bf3`; F14 commit `c0b878c` contains a divergent version. Preserve the selected-stack target guard, absolute status workdir, dynamic container name, and isolated selected env-file behavior when reconciling.

For the isolation marker proof, create a uniquely named marker table and row on D only, verify it is readable on D, then use read-only queries on A/B/C to confirm the D marker table is absent. Compare only PostgreSQL cluster system identifiers across D and A/B/C as a non-sensitive pre-existing-instance sentinel; do not read application rows from the other stacks. Distinct cluster IDs, container/volume/network names, and the D-only marker prove separate database instances and storage namespaces. This does not claim a row-by-row comparison of existing application data.

Do not use this stack for F15 feature implementation until the stack is healthy and its isolation evidence is recorded. Never operate on or reset another lane's stack.
