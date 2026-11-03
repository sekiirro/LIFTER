# F7 Traceability ? static source review

Analyzed source commit: `ed88574ae09c722b1f6ded4fc0b66122bbeb4f13`. Tests were inspected statically; this review ran no tests, Docker, Supabase, or stacks. VERIFIED means an asserting test exists on this commit.

| Requirement | Task(s) | Test(s) / evidence | Evidence | Status | Gap |
|---|---|---|---|---|---|
| FR-001 | T001,T004,T007 | `tests/unit/backup-streams.test.ts::encrypts a multi-chunk stream and decrypts it without a plaintext file` | Source `scripts/backup/backup.mjs`; commit `ed88574` | PARTIAL | Stream helper is asserted, but no test exercises the full backup CLI dump/encrypt flow; storage export is absent. |
| FR-002 | T003,T004,T007 | `tests/unit/backup-checks.test.ts::detects missing, extra, changed count and changed content` | `scripts/backup/lib/checks.mjs`; commit `ed88574` | PARTIAL | Test asserts comparison, not the table enumeration and checksum collection for all application tables. |
| FR-003 | T003,T004,T007 | `tests/unit/backup-manifest.test.ts::builds streaming SHA-256 hashes and verifies all required files` | `scripts/backup/lib/manifest.mjs`; commit `ed88574` | VERIFIED | ? |
| FR-004 | T002,T007 | `tests/unit/backup-retention.test.ts::retains the exact union over eighteen months, two backups per day` | `scripts/backup/lib/retention.mjs`; commit `ed88574` | VERIFIED | ? |
| FR-005 | T004,T007 | `tests/unit/backup-manifest.test.ts::rejects one-byte tampering before any decryption`; `tests/unit/backup-restore.test.ts::stops without backup and then removes the temp workdir on the failure cleanup path` | Commit `ed88574`; T007 records a prior local reviewer flow in `tasks.md` | PARTIAL | No asserting test covers successful isolated restore, full table comparison, smoke query, and teardown together. Manual reviewer evidence has no separate evidence record here. |
| FR-006 | T003-T005,T007 | `tests/unit/backup-redact.test.ts::redacts URLs, quoted passwords and identities` | `scripts/backup/lib/redact.mjs`, `.gitignore`; commit `ed88574` | PARTIAL | Redaction is asserted; ignore rules and all backup-folder/connection-string output paths do not have asserting tests. |
| FR-007 | T005-T006 | NOT-FOUND: documentation requirement; no asserting test located | `README.md` documents Task Scheduler and cron examples; commit `ed88574` | PARTIAL | Documentation exists but has no test assertion. |
| FR-008 | T002,T003,T007 | `tests/unit/backup-retention.test.ts::retains the exact union over eighteen months, two backups per day`; `tests/unit/backup-checks.test.ts::detects missing, extra, changed count and changed content` | Commit `ed88574` | PARTIAL | Unit assertions cover retention and comparison, but not full verification collection; end-to-end flow is a reviewer task, not a test in the cited files. |
| SC-001 | T007 | NOT-FOUND: no test asserting a successful full local backup/restore with 100% matching tables | `tasks.md` T007 is marked complete; no separate asserting test/evidence document cited | PARTIAL | Static review cannot validate the task's prior manual execution; no assertion file exists. |
| SC-002 | T003,T007 | `tests/unit/backup-manifest.test.ts::rejects one-byte tampering before any decryption` | Commit `ed88574` | PARTIAL | Tamper detection is asserted; wrong-key end-to-end failure has no asserting test located. |
| SC-003 | T004,T007 | `tests/unit/backup-streams.test.ts::encrypts a multi-chunk stream and decrypts it without a plaintext file` | Commit `ed88574` | VERIFIED | Test verifies encrypted multi-chunk output and absence of a plaintext dump file for the stream helper. |
| SC-004 | T002 | `tests/unit/backup-retention.test.ts::retains the exact union over eighteen months, two backups per day` | Commit `ed88574` | VERIFIED | ? |
| D-14 storage coverage (not represented by an FR) | ? | NOT-FOUND: no test for storage-object export or restore | `scripts/backup/backup.mjs:54-58` throws `STORAGE_EXPORT_UNSUPPORTED` when bucket count is nonzero; F14 migrations create `branding-staging` and `branding-validated`; D-14 requires storage exports | NOT-FOUND | Add complete Spec Kit coverage for approved D-14 storage backup/restore scope via PO/architect routing; no requirement was invented here. |

## Static verification notes

- Test files and exact titles above were checked against the `ed88574` source tree. No suite was run.
- Storage support gap was confirmed by static inspection of `backup.mjs` and merged storage-bucket migrations.
