# Spec Kit Analyze - F4 Authentication & Manual Recovery Links (round S35-R5, CodeRabbit round 2)

- Date: 2026-11-06 05:31 UTC (re-run after the last change to spec.md, plan.md, tasks.md and traceability.md in this round; the last edits were the PDN-F4-7-12 entry and the T045 blocker line, both before the format check)
- Base: `speckit-004-staff-recovery` @ `f53f8e4dbe9ee4015dcca363f01ce161fb800314` (PR #65, stacked on PR #63 via `speckit-004-t030`)
- Method: static cross-artifact review of `spec.md`, `plan.md`, `tasks.md`, `traceability.md`, `contracts/auth-surface.md`, `docs/04-changes-and-questions.md` (D-19 row and F4 open bullet), `docs/13-production-readiness.md` (AI-03, AI-04, ND-F4-3 rows), `supabase/config.toml`, `next.config.ts`, `middleware.ts`, `lib/auth/recovery-link.ts`, `lib/auth/recovery-session.ts`, `app/auth/recovery/{page.tsx,actions.ts}`, `lib/branding/upload-state.ts`, `.specify/memory/constitution.md` (VII, IX). Verified against code: no `Referrer-Policy` on `/auth/recovery` (T4); no `[auth.email.template.recovery]` locally, so the provider default applies (T2); the merged F4 expiry tests backdate `auth.users.recovery_sent_at` (T040 technique). No tests, Docker, Supabase stack or CI jobs were run in this analysis.
- Classification rule: CRITICAL = contradicts a PO decision or the Constitution; HIGH = a PO-words requirement or a security requirement lacks a requirement, a measurable criterion or a task; MEDIUM = an open PO decision, Sol critique, copy approval or architect decision that blocks implementation but not analysis; LOW = record hygiene or out-of-scope drift.

## Entry check (Spec Kit gate, section 1)

- [x] spec.md has numbered FRs (FR-001..FR-028), measurable SCs (SC-001..SC-013) and Given/When/Then scenarios for US1..US5 (`specs/004-auth/spec.md`).
- [x] Clarifications recorded: S35-PO-1 verbatim register, SK-004-01..06 register, ND-F4-1..7, PDN-F4-7-01..12, Architect rulings S35-R5 and S35-R6 (RD-1 reconciled). "No open ambiguities" is NOT claimed: PDN-F4-7-01..12 and the copy approval are open.
- [x] plan.md covers the ND-F4-7 scope (Design section steps 1 to 5, Constitution check); tasks.md has T033..T048 plus T037a and T044a, each tagged with FR IDs (`specs/004-auth/tasks.md`).
- [x] this file is dated after the last spec/plan/tasks/traceability change in this round.
- Open CRITICAL/HIGH findings: 0 (see verdict).
- Gate result for implementation: FAIL for ND-F4-7 implementation (MEDIUM findings N1, N2, N4, N16 block it). Implementation of ND-F4-7 must not start. Spec-level analysis: PASS.

## Round 2 CodeRabbit findings (S35-R5)

Intake classification: T1 and T2 HIGH (must stay HIGH until fixed); T3 and T4 Minor; nitpicks T040 and T041 from the review body (5795998809). Status after this round's spec fixes:

| ID | Source | Intake severity | Location | Finding | Status after this round |
|---|---|---|---|---|---|
| R2-T1 | CR thread `PRRT_kwDOVYgYQ860YtxN` | HIGH | `spec.md` FR-025; `plan.md` step 4; `tasks.md` T039, T044, T045 | Password update and completion audit are not atomic: `updateUser` runs, then a separate completion RPC can fail, so a password can change with no audit record. A separate RPC cannot roll back the Auth update. | FIXED in spec. FR-025 is two-phase and intent-first: `completion_started` is appended before `updateUser` and a failed append means no change; `completed` or `completion_aborted` closes the intent; open intents are reconciled by `completion_reconciled` after the 900 s window. Precedents cited: F5 FR-001, FR-002, FR-004; F4 FR-009; F14 `reconciliation_pending` (`lib/branding/upload-state.ts`). Tests: T039 (planned, RED). Implementation: not started. 0 open. |
| R2-T2 | CR thread `PRRT_kwDOVYgYQ860YtxR` | HIGH | `spec.md` FR-022, US5 scenario 3; `plan.md` step 3, step 5 | The default recovery email uses the provider's `ConfirmationURL`, which verifies on GET, so link scanners can consume the token. Local `supabase/config.toml` has no recovery template, so the default applies. | FIXED in spec. FR-022 requires an app link (`/auth/recovery`, `token_hash`, `type=recovery`, the `buildRecoveryUrl` shape) with GET and HEAD never verifying; verification only on the POST from Continue. Tests: T037a (scanner prefetch, planned, RED) and T040 (second use). Local template: T044a. Provider verify-endpoint behaviour is UNVERIFIED and not relied on. 0 open. |
| R2-T3 | CR thread `PRRT_kwDOVYgYQ860YtxX` | Minor | `spec.md` FR-019 | FR-019 has no end point for the built-in-email restriction. | FIXED in spec. FR-019 is scoped to the test phase before the FR-020 gate; post-gate delivery is the PO-approved SMTP configuration (PDN-F4-7-10, -11). The reading of the PO words "temporarily" is an architect reading, to be confirmed by the PO (N18). |
| R2-T4 | CR thread `PRRT_kwDOVYgYQ860YtxZ` | Minor | `tasks.md` T045; `spec.md` FR-022 | `Referrer-Policy` cannot be set from the page component; it must be a response header. Verified: `next.config.ts` sets it only for `/register/:token`; `middleware.ts` only for the register and branding trees; `/auth/recovery` has no such header today. | FIXED in spec. T045 sets it in `next.config.ts` `headers()` for `/auth/recovery`, following the `/register/:token` pattern; T037 tests the response header. |
| R2-N-T040 | CR review body, nitpick | Nitpick | `tasks.md` T040 | Test only the configuration value, not the expiry. | FIXED in spec. T040 adds real expiry by backdating `auth.users.recovery_sent_at` past 60 minutes, then verifying (the merged F4 technique). `otp_expiry` is a supporting check only. |
| R2-N-T041 | CR review body, nitpick | Nitpick | `tasks.md` T041 | The flow stops after delivery and does not reach the signed-in area. | FIXED in spec. T041 adds Inbucket link, Continue, set password, signed-in area, and old password fails. No time target (PDN-F4-7-09 open). |

Open CRITICAL/HIGH after these fixes: **0**. R2-T1 and R2-T2 are HIGH only until fixed and are now fixed in the spec; their tests and implementation are not yet run.

## RD-1 reconciliation (S35-R6)

| ID | Status |
|---|---|
| N14 (RD-1) | CLOSED. docs/13 ND-F4-3 says "PO decision: B", the original deferral option. S35-PO-1 "ND-F4-3=A" selected option (a), "confirm B". Both mean the deferral stands; the session-lifetime blocker stays Open, Pre-Production. Recorded as Architect note S35-R6 in `spec.md` Clarifications and in `traceability.md`. The docs/13 label text is not edited (PO-decision record); flagged under N10. |

## Carry-over findings (previous round, status unchanged unless noted)

| ID | Category | Severity | Location | Status now |
|---|---|---|---|---|
| A1 | Decision to implementation (T031 limits) | MEDIUM | `tasks.md` T031 | Unchanged. Not ND-F4-7. |
| A2 | Source gap (ND-F4-3 deferral) | MEDIUM | `spec.md` ND-F4-3 | Resolved for the deferral by S35-PO-1 `ND-F4-3=A`; label reconciled by S35-R6 (N14). |
| A3 | Decision to implementation (T032 Trainers) | MEDIUM | `tasks.md` T032 | Unchanged. Not ND-F4-7. |
| A4 | Task closure (T030) | LOW | `tasks.md` T030 | Unchanged. |
| A5 | Evidence breadth (FR-001/002/003 partial or unverified) | LOW | `traceability.md` | Unchanged. |

## New findings (this round, other than the CodeRabbit items above)

| ID | Category | Severity | Location | Finding | Recommendation / blocked |
|---|---|---|---|---|---|
| N1 | PO decision open | MEDIUM | `spec.md` ND-F4-7 PDN register (PDN-F4-7-01..11) | Eleven questions the PO has not answered. Each is listed with options and a recommendation; no default is encoded. Options unchanged this round. | Blocks T034, T038, T039, T043 to T046 and T047. |
| N2 | Workflow gate | MEDIUM | `spec.md` Status line of ND-F4-7; `plan.md` ND-F4-7 Status | Sol Medium critique PENDING. The round-2 design (FR-022, FR-025) is a new security-relevant design and is part of that critique. | Blocks T033 and T048. Do not invoke without approval. |
| N3 | Provider behaviour unverified | MEDIUM | `spec.md` FR-021, FR-022; `tasks.md` T040, T037a | Single use and supersession for self-service email links, and whether the provider's verify endpoint consumes on GET, are not known. Written as UNVERIFIED; the app design does not depend on them for the scanner case. | SC-010 and T037a executed on the local stack decide them. If the provider does not supersede, escalate, do not work around. |
| N4 | Copy | MEDIUM | `spec.md` FR-027, PDN-F4-7-06 | All new strings are BLOCKED-COPY, including the new failure state used by FR-025 (a) and (c). | Blocks T042, T043, T044a, T045. PO approves exact strings. |
| N5 | Technical design (architect) | MEDIUM | `plan.md` AT-1; `spec.md` FR-025 (requested row) | Audit-before-send for the `requested` row leaves a `requested` row when the provider then fails to send. The round-2 ruling covers completion only. | Architect decision with security review, before T039 and T044. Not a PO decision. |
| N6 | Measurable criterion (security) | MEDIUM | `spec.md` FR-018; `plan.md` AT-2 | Timing tolerance and test method for FR-018 are not set. | Set in plan.md with the security review before T035 and T041 go green. Add an SC then. |
| N7 | Assumption conflict | MEDIUM | `spec.md` Assumptions; FR-024; PDN-F4-7-04 | Option C would revise the "no IP blocking" Assumption. | Blocks T038 keying. |
| N8 | Constitution I justification | MEDIUM | `plan.md` ND-F4-7 Constitution check, row I | "Foreign-workspace negatives not applicable" for a platform-scoped reset. The rate-limit table and audit rows may carry a workspace. | Architect confirms or adds a foreign-workspace negative before T044. |
| N9 | Provider quota starvation (residual risk) | LOW | `spec.md` Security Notes S3 | Per-project built-in quota can be exhausted by others. | Residual risk stated; PDN-F4-7-11. |
| N10 | Out-of-scope stale rows | LOW | `docs/07-production-readiness.md` ND-F4-7 row; `docs/01-traceability.md` PRD-02 row; `docs/02-architecture.md:18`; `docs/03-roadmap.md`; `docs/13-production-readiness.md:34` ND-F4-3 wording (RD-1 "reconcile" text) | Not edited this round. The docs/13 row still names RD-1 as a discrepancy. | Architect follow-up. Not fixed here. |
| N11 | Coexistence check | LOW | `spec.md` FR-005; `plan.md` step 1 | Request form stays on `/login`; the public allow-list does not change. No finding. | None. |
| N12 | Provider not chosen | MEDIUM | `spec.md` PDN-F4-7-10; FR-020 | No external SMTP provider is chosen. | Blocks general rollout only. No code task. |
| N13 | Reserved number | LOW | `spec.md` PDN-F4-7-08 | Intentionally unused. | None. |
| N14 | Record discrepancy RD-1 | LOW | - | CLOSED by S35-R6 (see RD-1 section). | None. |
| N15 | Session lifetime (open blocker) | LOW | `spec.md` FR-026, S8; `docs/13` ND-F4-3 | The reset creates a normal session. Open blocker unchanged. | Stays Open, Pre-Production. |
| N16 | PO decision open (new, PDN-F4-7-12) | MEDIUM | `spec.md` FR-025 (b), PDN-F4-7-12 | The user-visible response when the `completed` append fails after the password has changed is not decided. Options A (complete and redirect), B (failure state), C (neutral retry). No default encoded. | Recommendation A. Blocks the completion response branch of T045 only. |
| N17 | Reconciliation scheduling (architect) | LOW | `plan.md` step 4; `tasks.md` T044 | The reconciliation call is not yet scheduled. Any scheduler must follow the F6 jobs convention and be idempotent (Constitution IX). | Decided at T044 under the F6 jobs convention; not a PO decision. |
| N18 | Scope reading (architect) | LOW | `spec.md` FR-019 | The post-gate end point of the built-in-email restriction is an architect reading of "temporarily" and "External SMTP required before general rollout". | PO confirmation under PDN-F4-7-11. |

## Coverage

- FR-016..FR-028 each have at least one task (T034..T046, T037a, T044a, T048) and a traceability row, all UNVERIFIED.
- SC-008..SC-013 each have a task and a traceability row, all UNVERIFIED.
- Scenarios 1 to 9 of User Story 5 each map to FR and task (see traceability.md). Scenario 3 now covers scanner prefetch (T037a). Scenario 4 now covers the started row (T039).
- Round-2 items have their own section in `traceability.md` ("S35-R5 rows").
- Every PO-words sentence in S35-PO-1 is quoted verbatim in spec.md Clarifications and is cited to the verbatim file.
- Architect notes are labelled "Architect note (not PO words)" or "S35-R5" / "S35-R6" wherever used.
- No copy string is invented (FR-027). The failure-state copy in FR-025 (a) and (c) is BLOCKED-COPY.
- Hosted Supabase Auth and SMTP configuration: out of scope (T047), gated on separate PO approval.
- PDN-F4-7-01..12: all open. No option was changed this round.

## Verdict

**Spec-level analysis: PASS** - 0 CRITICAL, 0 HIGH open. Round-2 HIGH items R2-T1 and R2-T2 were fixed in the spec this round and are not counted as open; their tests and implementation are not yet executed.

MEDIUM: 12 open (N1, N2, N3, N4, N5, N6, N7, N8, N12, N16; carried A1, A3). LOW: 8 open (N9, N10, N11, N13, N15, N17, N18; carried A4, A5). N14 is closed.

**ND-F4-7 implementation: BLOCKED** by N1, N2, N4, N5, N6, N7, N8, N12 and N16 (MEDIUM). N3 blocks acceptance of the provider-behaviour rows, not the start of work. Implementation must not start until the PO answers the blocking PDN items (including PDN-F4-7-12), approves copy, the Sol Medium critique is completed and this file is re-run.
