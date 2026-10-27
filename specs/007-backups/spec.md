# Feature Specification: Encrypted Backups & Restore Test (P0-F7)

**Feature Branch**: `007-backups`
**Created**: 2026-10-27
**Status**: Draft
**Input**: D-14 (encrypted local DB + storage exports with restore testing, $0). Architecture v3 § Backups. Constitution Platform constraints: "A failed or missing restore test blocks production migrations." Roadmap production gate.

## User Scenarios & Testing *(mandatory)*

Actors: **Operator** (the PO, or someone acting on the PO's machine), **Reviewer**.

### User Story 1 - Create an encrypted backup (Priority: P1)

The operator runs one command against a database connection string. The command produces a timestamped backup folder containing:

- the encrypted roles, schema and data dumps
- an encrypted verification record (per-table row counts and content checksums)
- a plaintext manifest listing each encrypted file's SHA-256

Plaintext database content is never written to disk.

**Why this priority**: D-14. Supabase Free has no backups, and losing the ledger is unacceptable.

**Independent Test**: Run the backup against the local stack, then inspect the folder.

**Acceptance Scenarios**:

1. **Given** a reachable database and an encryption public key, **When** the backup runs, **Then** the folder contains only encrypted dump files, the encrypted verification record and the manifest, and the command exits 0.
2. **Given** any produced file other than the manifest, **When** scanned, **Then** no plaintext SQL or table data appears in it.
3. **Given** a missing key, an unreachable database or a dump failure, **When** the backup runs, **Then** it exits non-zero, leaves no partial folder marked complete, and prints no secrets or connection strings.

---

### User Story 2 - Retention (Priority: P2)

After each successful backup, older backups are pruned to keep: the newest per day for 14 days, the newest per ISO week for 8 weeks, and the newest per month for 12 months.

**Independent Test**: Unit-test the retention selection with synthetic dates. Integration: pruning deletes only non-retained folders.

**Acceptance Scenarios**:

1. **Given** backups over 18 months, **When** pruned, **Then** exactly the retained set remains, per the rule.
2. **Given** a failed backup, **When** it finishes, **Then** no pruning happens.

---

### User Story 3 - Restore test (Priority: P1)

The operator runs a restore test with a backup folder and the offline private key. The command:

- verifies the manifest hashes
- decrypts in memory
- restores into a fresh, isolated local database stack that is separate from the developer stack
- compares per-table row counts and checksums against the verification record
- runs a smoke query
- appends a pass/fail line to a local results log

**Why this priority**: Constitution: a failed or missing restore test blocks production migrations.

**Independent Test**: Seed data locally, back it up, restore-test it, then tamper with an archive and confirm the test fails.

**Acceptance Scenarios**:

1. **Given** a valid backup and the right key, **When** the restore test runs, **Then** every table's count and checksum match and the result is PASS.
2. **Given** a ciphertext file modified by even one byte, **When** run, **Then** it fails at hash verification (FAIL), and nothing is restored.
3. **Given** the wrong private key, **When** run, **Then** it fails clearly (FAIL).
4. **Given** the restore test, **When** it runs, **Then** the developer's normal local stack and its data are untouched.

### Edge Cases

- No storage buckets exist yet. The storage export step reports "0 buckets" and is extended when the first bucket feature lands.
- Very large dumps: streaming encryption; memory stays bounded.
- Windows and Linux both supported for the operator (Docker required for the restore test).

## Requirements *(mandatory)*

- **FR-001**: The backup MUST dump roles, schema and data with the pinned database CLI, encrypting each stream to a recipient public key before it touches disk.
- **FR-002**: The backup MUST record per-table row counts and deterministic content checksums for all application tables (non-system schemas created by migrations, plus auth users), encrypted alongside.
- **FR-003**: The manifest MUST list each file's SHA-256, the creation time, the CLI version and the format version. It MUST contain no table data.
- **FR-004**: Retention MUST follow 14 daily / 8 weekly / 12 monthly, applied only after a successful backup.
- **FR-005**: The restore test MUST verify hashes before decrypting, restore into an isolated fresh stack (different project id and ports), compare all counts and checksums, run a smoke query, write a result line (timestamp, backup id, PASS/FAIL, reason code), then tear the stack down.
- **FR-006**: Private keys, connection strings and backup folders MUST never be committed (gitignore) or printed.
- **FR-007**: The scheduling of daily runs on the operator machine is documented (Windows Task Scheduler and cron), not automated by this feature.
- **FR-008**: The retention logic and verification comparisons MUST be unit-tested. The end-to-end backup → restore → tamper flow MUST be verified locally by the reviewer.

## Success Criteria *(mandatory)*

- **SC-001**: A local end-to-end run yields PASS with 100% of tables matching.
- **SC-002**: The tamper and wrong-key cases yield FAIL 100% of the time.
- **SC-003**: 0 plaintext dump bytes are found on disk after a backup.
- **SC-004**: The retention unit tests cover ≥ 18 months of synthetic history.

## Assumptions

- The age format (X25519 recipients) through a pure-JS implementation. The private key is generated and kept offline by the PO; the repo provides a key-generation helper that writes it only where the operator chooses.
- Running against staging or prod requires the PO to supply the connection string at run time. No remote run happens in this feature.
- RPO ≤ 24 h and RTO ≤ 4 h are operational targets checked later in a drill against a fresh Free project (needs PO approval).
- GitHub Actions as an optional runner is out of scope. It would need a secret, which needs PO approval.
