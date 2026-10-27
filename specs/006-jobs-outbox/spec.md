# Feature Specification: Outbox Jobs & Cron Drain Worker (P0-F6)

**Feature Branch**: `006-jobs-outbox` (stacked on `005-audit-log`)
**Created**: 2026-10-27
**Status**: Draft
**Input**: Roadmap P0 "outbox jobs + cron Worker". Architecture v3 § Stack/Jobs: a `jobs` table drained by a Cloudflare Cron Trigger every minute with `FOR UPDATE SKIP LOCKED` and a unique idempotency key; the service role is used only through scoped RPCs that take an explicit workspace. Constitution IX: idempotent, with deterministic dedup keys.

## User Scenarios & Testing *(mandatory)*

Actors: **Feature code** (future reminders, notices, Telegram delivery), **Cron Worker**, **Operator** (PO / reviewer).

### User Story 1 - Enqueue work exactly once (Priority: P1)

Database-side feature code enqueues a job with a kind, an optional workspace, a non-PII payload, a run time and a deterministic idempotency key. Enqueuing the same key again returns the existing job and never creates a duplicate.

**Why this priority**: Constitution IX. Reminders, notices and deliveries must never duplicate.

**Independent Test**: Enqueue the same key twice, including concurrently, and observe one job.

**Acceptance Scenarios**:

1. **Given** a new key, **When** it is enqueued, **Then** one pending job exists.
2. **Given** an existing key, **When** it is enqueued again (sequentially or in parallel sessions), **Then** no new job is created and the same job id is returned.
3. **Given** a signed-in or anonymous API caller, **When** they try to enqueue, read or modify jobs, **Then** it is rejected.

---

### User Story 2 - Safe concurrent draining with retries (Priority: P1)

The cron Worker claims due jobs in batches. Two concurrent drains never claim the same job. Successful jobs are marked done. Failed jobs retry with increasing delays and become dead after a maximum number of attempts. A crashed drain's jobs become claimable again after their lease expires.

**Why this priority**: The core reliability guarantee (Architecture: "retries never duplicate").

**Independent Test**: Concurrent claims, a failure sequence and lease expiry against the real database.

**Acceptance Scenarios**:

1. **Given** 20 due jobs and two simultaneous claims of 10, **When** both return, **Then** the claimed sets are disjoint and their union is 20.
2. **Given** a claimed job that fails, **When** it is reported failed, **Then** its attempts count increases, it becomes pending again with a later run time, and the failure is recorded as a short error code (never payload or PII).
3. **Given** a job that reaches its maximum attempts, **When** it fails again, **Then** it becomes dead, is no longer claimed, and an audit event records the dead-lettering.
4. **Given** a claimed job whose lease has expired, **When** a new claim runs, **Then** the job can be claimed again.
5. **Given** a completion or failure report carrying a stale lease token, **When** submitted, **Then** it is ignored, so a slow drain can't overwrite a re-claimed job.

---

### User Story 3 - Cron Worker drains on schedule (Priority: P2)

A separate small Worker runs every minute. It claims a batch, dispatches each job to a registered handler by kind, and reports success or failure. An unknown kind fails permanently (dead). The Worker builds for the edge host without deploying.

**Why this priority**: Architecture: separate `cron` Worker.

**Independent Test**: Unit-test the drain loop with a fake database client. The Worker build dry-run succeeds in CI.

**Acceptance Scenarios**:

1. **Given** claimed jobs of known kinds, **When** drained, **Then** each handler runs once and each job is reported done.
2. **Given** a handler that throws, **When** drained, **Then** the job is reported failed with a non-PII error code, and the other jobs still run.
3. **Given** an unknown kind, **When** drained, **Then** it is reported as a permanent failure.
4. **Given** the drain runs past its time budget, **When** the budget is exceeded, **Then** it stops claiming new batches. Unfinished jobs are recovered by lease expiry.

### Edge Cases

- A job whose workspace has no `workspace_id` (platform-level) is allowed. Workspace-scoped handlers must receive the explicit workspace id from the job, never from the payload.
- Clock skew between Worker and database: the database's `now()` is the only clock used for due and lease decisions.
- Payload size is bounded to keep rows small.

## Requirements *(mandatory)*

- **FR-001**: A jobs store MUST hold kind, optional workspace, payload (a non-PII object, size-limited), idempotency key (unique), status (pending | running | done | dead), run-at time, attempts, max attempts, lease token and expiry, last error code, and timestamps.
- **FR-002**: Enqueue MUST be idempotent on the key and safe under concurrency. It is available only to database-side code (not API roles).
- **FR-003**: Claim MUST select due pending jobs and jobs with expired leases, using skip-locked row locking. It sets a fresh lease token and expiry and increments attempts.
- **FR-004**: Complete and fail MUST require the current lease token. Fail applies exponential backoff (capped) and dead-letters at max attempts, or immediately when the failure is permanent.
- **FR-005**: Dead-lettering MUST write an audit event (`job.dead_lettered`) with the job id, kind, workspace and error code.
- **FR-006**: Claim, complete and fail MUST be callable only by the service role. API roles (anonymous, authenticated) have no access to jobs or these functions.
- **FR-007**: A separate cron Worker MUST run every minute, drain within a time budget, use a handler registry keyed by kind, and read its database credentials only from runtime secrets (never committed).
- **FR-008**: CI MUST dry-run build the cron Worker without deploying.

## Success Criteria *(mandatory)*

- **SC-001**: 0 duplicate jobs across repeated and concurrent enqueues of the same key.
- **SC-002**: 0 jobs claimed twice by concurrent drains while a lease is valid.
- **SC-003**: 100% of dead-lettered jobs have exactly one audit event.
- **SC-004**: 0 API-role accesses succeed against jobs or the job functions.

## Assumptions

- No business job kinds exist yet. A `system.noop` kind proves the pipeline. Real kinds come with their features (reminders P5, Telegram P6, notices P1/P4).
- Defaults: max attempts 5, backoff 1, 2, 4, 8… minutes capped at 60, lease 5 minutes, batch 25, time budget 20 s. These are technical defaults, not business rules, and are configurable.
- Production cron deployment and the service-role secret are set up at deploy time (needs PO approval). Nothing is deployed here.
