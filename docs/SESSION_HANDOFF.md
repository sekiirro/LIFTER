# LIFTER — SESSION HANDOFF (end of Session 12, 2026-10-29)

**Untracked in `LFTR`; never stage or commit it here. PO-directed snapshots live only on branch `docs-session-handoff` (worktree `LFTR-handoff`).** In the protected `LFTR` checkout, edit only this handoff. Preserve existing deletions under `LIFTER_Claude_Files/`, untracked `.agents/`, `docs/F10_AUDIT.md`, `.env.local`, and `opencode.json`. Never print or copy secrets. Facts below were rechecked read-only at handoff; this is not approval to merge, deploy, publish, or delete anything.

## 1. Session 12 outcomes (architect-verified)

- **F12 — 012-registration-approval**; worktree `LFTR-012`; Stack A (`project lifter`, API 54321 / DB 54322); Codex thread `01a187c9-331e-7900-89e7-4db5d7f0c3a6`. Pushed `7f2cc19`: main merge `ea5e872`; Sales `approve_registration` removal with TS+SQL parity `59f206b`; U2 model migration `20261101120000` (`50cc77e`); U3 approve/reject/reconsider `20261101121000` (`7f2cc19`). Gates: 1,449 unit; 971/0/0 integration on A. Verified `tasks.md`: checked T001, T004–T017, T049, T052 (17 checked); unchecked T002, T003, T018–T048, T050, T051, T053, T054. Architect notes: `f12_guard_client_transition` blocks all non-approval client UPDATEs, so F13 refund-deactivation needs a forward amendment. U3's catch-all handler returns generic “unavailable” with no safe-code operational signal; add one in a later unit.
- **F14 — 014-workspace-branding**; worktree `LFTR-014`; Stack B (`lifter-stack-b`, API 25421 / DB 25422, storage-api on, `LIFTER_SUPABASE_STACK=b`); thread `01a187c9-3336-7670-8d66-bb70b94fbf1b`. Pushed `f28e19a` (main merge `30efad9`, T044 `852002b`, T047/T045/T046 migrations `20261102120000` / `20261102121000` / `20261102122000`). Local-only RED commit `65f69dc` (cherry-pick of `b87ad97`, T011/T012) is the only commit in `origin/014-workspace-branding..HEAD`; backup branch `s12-red-backup` is at `33fd95a`. Gates: 1,404 unit; 911/0/2 integration on B. `ci.yml` now runs integration on the Stack B profile with Storage; this CI change has not been verified in CI. Render-handle caps (TTL 5m bounded by F10 deadline, 8 active/link, 30 issues/link/5m) are ARCHITECT-PROPOSED; PO decision F14-1 remains OPEN. Hosted transform check is a pre-production obligation (quickstart). T005/T008 capability matrix waits for F12 merge.
- **F13 — 013-freeze-renewal-refunds**; worktree `LFTR-013`; thread `01a187c9-3359-75e3-9081-8ba409174ae8`. Spec Debate head `f691955`; PO decision record committed and pushed as `766e3e5`; Session 13 decision-record head `270c9ceefbd06b2339de3fcbb1863f3c8694aa4b`.
- **F15 — 015-forms-intake**; worktree `LFTR-p2`; thread `01a187c9-33a4-74b0-9266-ed13e2fbdac8`. Spec head `7ecbb2b` (renamed from `p2-forms-intake`; old branch retained); PO decision record committed and pushed as `4042b24`. Revise the spec per PO decisions and architect-flagged consequences below.
- **ND-F4-3 = B (PO):** recovery TTL is not enforced as a session lifetime. Record this blocker in `docs/13` in the first lane PR, verbatim: “Recovery-session TTL is not enforced as a session lifetime: recovery verification creates a normal authenticated Supabase session, and the 900-second check gates only the app password-set action. After that window, the session remains usable and a holder can call GoTrue `updateUser` directly with its access token, bypassing the app check. Blocker: enforce recovery state and expiry across authenticated routes/actions and Auth API access, terminate the session at expiry, and verify GoTrue password-change reauthentication settings.” Fix is a later feature; track as a security blocker.
- `docs/10` F12/F14 rows have stale SHAs. Refresh them in the first lane PR.

## 2. PO decisions (2026-10-29) — binding text, verbatim

# LIFTER — PO decisions, 2026-10-29 (Session 12) — BINDING, verbatim from PO

**F13 — Freeze / Renewals**
- F13-1: PO/WO/Trainer/Sales can Freeze individual clients for a selected duration. No package-based limits. Record actor, duration and audit. Show STOP/REMOVE in Subscription UI.
- F13-2=A: Freeze activated subscriptions, including overdue; payment restrictions remain.
- F13-3=B: Cairo calendar-day counting; STOP day does not count as frozen.
- F13-4=A, expanded: PO/WO/Trainer/Sales can STOP/REMOVE. STOP preserves actual frozen-day extension; REMOVE reverses the freeze extension as though it never happened, without rewriting historical access. Audited.
- F13-5=A: Current approved price at renewal, purchase snapshot, no renewal before initial activation; late renewal starts on recording date.
- F13-6=A: Maximum ONE not-yet-started renewal at a time, NOT lifetime. Automatically shift future start when the current entitlement extends; reject conflicts.
- F13-7/8: External refunds are manually recorded at refund time. If multiple paid purchases exist, explicitly select the purchase being refunded.
- F13-9=A: Refund allowed for active, frozen, expired and paid-unactivated subscriptions.
- F13-10=A: During Freeze restrict plans/exports, retain login/settings.
- F13-11=CUSTOM: Renewals support the SAME existing installment workflow as initial purchases: upfront payment, installment configuration, monthly dues, overdue access restriction, payment confirmation. PO/WO/Trainer/Sales may confirm renewal installments. Do not invent a separate installment system.

**Refund decisions — supersede D-15**
- PO-only Full or Partial Refund; editable amount defaults to the refundable collected balance.
- Zero can appear while editing but MUST NOT be confirmed.
- Multiple legitimate partial refunds allowed; cumulative refunds cannot exceed actual unrefunded collections.
- Reverse commission proportionally using purchase-time snapshots, deterministic rounding, immutable append-only ledger, idempotency and concurrency safeguards.
- ANY successful refund, including partial or future-renewal refund, immediately deactivates the client and removes them from Active Clients, even if paid entitlement remains.
- Partial Refund is discretionary goodwill exit after service delivery, NOT discounted continuing access.
- Preserve necessary financial/audit history. Do not physically delete immutable ledger events.
- ALL payments, renewals, installment collections and refunds occur OUTSIDE LIFTER. LIFTER only records/attests them; NO payment gateway.

**F15 — Forms / Intake**
- F15-1=A: PO/WO/Trainer may create, copy, edit, publish and retire workspace forms; Sales excluded.
- F15-2=B: Delivery becomes late at 00:00 Cairo after the fifth working day, respecting the existing D-03 counting rule.
- F15-3=B: Dedicated `assign_intake_form` capability for Trainer authorization.
- F15-4=CUSTOM: PO will supply the named initial Mandatory Intake and its actual questions WHEN implementation reaches that task. Ask then; never invent its content. Every Form Builder requires separate Arabic and English versions.
- F15-5=CUSTOM: Initial late alert to responsible Trainer, otherwise PO. If Trainer assigned and delay persists, escalate once after TWO HOURS to both WO and PO. Prevent duplicates.
- F15-6=CUSTOM: Configurable per-form assignment triggers, target audience and recurrence: mandatory after client approval/on login, one-time specific-client forms, or recurring forms for eligible individuals/cohorts (e.g. weekly check-ins after activation).
- F15-7=CUSTOM: Client/Trainer/PO/WO can correct submitted answers with authorization, immutable versions/audit; original delivery deadline does not reset.
- F15-8=CUSTOM: Sensitive client-specific Forms data retention = 30 days.

**Retention — FINAL**
- RET-1=B: 30-day clock starts when client relationship ends (Closure/Refund/Deactivation). Necessary data stays while Active.
- RET-2=A: Purge client-specific drafts, answers, correction content and attachments; retain reusable templates and legally required minimal audit evidence.
- RET-3=A: Maximum 30 days across ALL recoverable copies, including backups. Technical feasibility and legal exceptions require review BEFORE production.

**New-session execution instructions (PO)**
1. Read updated handoff and inspect ACTUAL Git/worktree/agent/stack/lock/CI state. Resume existing partial work; never overwrite uncommitted work.
2. Delegate up to 6 parallel agents, with Luna High initially: F12 implementation — Stack A; F13 specification/implementation planning, then safe independent work; F14 implementation — Stack B; F15 specification/implementation planning, then safe independent work; F12/F13 financial ledger integration audit; F14/F15 authorization, privacy and retention audit.
3. Advance F12/F13/F14/F15 concurrently with balanced priority. Use the two existing isolated local DB stacks; verify isolation and assign exclusive DB ownership. Additional DB-dependent work requires verified isolated resources. Never share a live DB lock.
4. Model routing: Luna High is the immediate default. Reserve Sol Medium for genuinely difficult/high-risk security, RLS, financial consistency and architecture. Verify Luna/Sol quota reset around 11:43 AM Cairo. GLM may handle appropriate lower-risk work after its quota resets; reported times conflict (02:16 / 02:43 Cairo), so verify actual availability. Never assume a reset.
5. Claude orchestrates and independently reviews delegated work; avoid unnecessary direct implementation and token waste.
6. Preserve all merge gates: exact-head CodeRabbit APPROVED, zero unresolved threads, green CI, independent Claude review, explicit PO exact-SHA approval. Temporary PUBLIC CI windows require separate PO approval and verified return to PRIVATE.
7. Flag unresolved technical/legal blockers; do not silently invent PO decisions.

## 2a. Session 13 PO decisions (2026-10-29) — binding, verbatim

- **PO-1=A:** Any Refund immediately blocks client login, revokes sessions, and preserves financial/audit records.
- **PO-2=A:** Renewal installments are anchored to recording date, unaffected by service delays or Freeze.
- **F14-1=A:** Render handles: 5-min expiry, 8 active/link, 30 per rolling 5 min.

### Session 13 PO confirmations

- **Freeze start day:** the day a Freeze is applied counts as frozen, not consumed service.
- **F15 corrections:** PO/WO/Trainer/Client may correct, with immutable version history. A detailed operations × fields permission matrix is to be delegated and submitted for PO approval.
- **Retention:** 30 days including backups; legal/technical exceptions remain production blockers.
- **Mandatory Intake questions:** deferred until the relevant task.
- **Permission parity:** fix the High TS↔SQL permission-parity test gap (test BOTH directions) before merging any permission change.
- **F14 labels:** fix the four stale ARCHITECT-PROPOSED labels without changing the approved caps.

### Architect notes (not PO decisions)

- PO-1 resolves session-12 PO-CONFIRM 3c (refund deactivation blocks login). Design consequence: refund must atomically record the deactivation fact AND revoke all Auth sessions/refresh tokens and block new sign-in (server-side, not UI-only); financial/audit records are never deleted. Starts the RET-1 30-day clock.
- PO-2 resolves session-12 PO-CONFIRM 3d (both questions): renewal installment due dates anchor to the renewal recording date; neither the F13-6 automatic start shift of an unstarted renewal nor any Freeze extension moves those due dates.
- F14-1 here is the PO's label for the render-handle caps (session-12 handoff item 3m). It is distinct from the F14 spec's existing "F14-1" Hero Banner decision; record it in the F14 spec as "F14-1 (render-handle caps, session 13)". The existing invariant that a handle never outlives the live F10 effective deadline is unchanged.

## 3. Architect-flagged conflicts / blockers created by those decisions

These are implementation consequences for the next session to design, not new PO decisions. Items marked **PO-CONFIRM** need confirmation before the affected slice only.

a. **Capability matrix:** F13-1/F13-4 give Trainer freeze/stop/remove (supersedes D-09 PO/WO/Sales); F13-11 gives Trainer renewal-installment confirmation (`record_payment`); F15-3 adds `assign_intake_form`; F15-1 gives Trainer publish/retire. All require TypeScript `lib/auth/capabilities.ts` and SQL `app_private.role_has_capability` parity changes sequenced after F12 (Sales approval removal) and F14 (`manage_branding`). F13 “no new capability” is superseded.
b. **Refund ledger redesign (supersedes D-15 and F13 spec judgment C):** F13 planned one terminal `refund_reversal` per collection using F12 `reverses_event_id` uniqueness. Multiple partial refunds with proportional commission reversal break that design. Sol Medium architecture pass: cumulative-cap invariant (sum of refunds ≤ unrefunded collections) enforced in DB under lock; deterministic proportional commission rounding with cumulative remainder so total reversed commission never exceeds stored commission; interaction with F12 correction chain; idempotency; race fixtures. Reject zero-amount confirmation.
c. **Refund deactivation:** Any successful refund deactivates the client and removes them from Active Clients even with entitlement remaining. Needs a client lifecycle/deactivation fact and forward amendment of F12 `f12_guard_client_transition`; this starts RET-1's 30-day clock. **PO-CONFIRM:** Does deactivation also block login, or only remove from Active Clients and stop plans/export? Login behavior is unstated. — RESOLVED 2026-10-29 by PO-1 (login blocked, sessions revoked)
d. **F13-11 renewal installments:** Reuse the existing installment workflow; due-date anchor (renewal recording date vs service start) is unstated. **PO-CONFIRM before this slice.** Whether F13-6 automatic shift of the one unstarted renewal also shifts installment due dates: **PO-CONFIRM together.** — RESOLVED 2026-10-29 by PO-2 (recording-date anchor; unaffected by shift/Freeze)
e. **Freeze day clamp:** F13-3=B (STOP day is not frozen) and F13-4 REMOVE reverses extension “as though it never happened” without rewriting delivered access. If access was delivered during the freeze window, REMOVE can pull end date below today; define a clamp that never ends entitlement before now/delivered access.
f. **F13-7/8:** Refund date is recording date (manual recording at refund time); explicitly select a purchase when multiple paid purchases exist. Refunding a future renewal also deactivates the client.
g. **F15-2=B DST:** 00:00 Cairo may not exist on a DST spring-forward date; use the first valid instant of that Cairo date via a zone library and add DST fixtures.
h. **F15-5 escalation:** Two-hour escalation needs a scheduler, reusing the approved owner-only `pg_cron` pattern from F11 migration `20261031130000`; still requires authoritative P4 delivery/responsible-trainer facts before real-data alerts.
i. **F15-6 scope conflict:** Recurring/cohort assignment expands MVP and conflicts with BRD-06 line 92 (no bulk/mass assignment) and the F15 spec “per-client selection only.” PO decision supersedes; record the BRD conflict. Slice one-time per-client first.
j. **F15-7 corrections:** Need operation × role × field matrix; original SLA never resets.
k. **Retention RET-1..3 / F15-8:** 30 days across ALL recoverable copies incl. backups. Hosted Supabase backup/PITR retention may exceed 30 days and backups may not be selectively purgeable. Technical + legal feasibility review required BEFORE production (blocks production real data, not local/CI synthetic work). Reconcile with financial ledger/audit retention (retain minimal legally required evidence; ledger never physically deleted), B4/ND-F5-1/DP-01/02.
l. **F15-4:** PO supplies initial Mandatory Intake questions when implementation reaches that task; ask then, never invent. Form Builder requires separate AR and EN versions.
m. **F14-1 render-handle caps:** Still OPEN. — RESOLVED 2026-10-29 by F14-1 (5-min expiry, 8 active/link, 30 per rolling 5 min); record in the F14 spec in the F14 lane

## 4. Open PO/admin items

- F14-1 render-handle caps decision — RESOLVED 2026-10-29.
- CircleCI disconnect (PO browser action).
- Actions billing: private CI blocked. Each temporary PUBLIC window needs separate PO approval; always restore PRIVATE and verify.
- Docker Hub secrets.
- Branch/worktree cleanup: see actual state table below; delete nothing.
- `docs/04` D-15/D-09 superseded entries need a later docs PR; do not edit them on main in this handoff task.

## 5. Actual repository/worktree state (read-only inspection)

Handoff snapshots are committed on branch `docs-session-handoff` (worktree `LFTR-handoff`, from `origin/main`, no PR): Session 12 snapshot `59e1884f4e5b1caeee3849acb784c95aa6aa8dba`; Session 13 snapshot is the pushed branch tip recorded by Git after Task D.

Inspected with `git fetch --all --prune`, `git worktree list`, and `git -C <worktree> status -sb`, `log --oneline -3`; also `gh pr list --state open`, `gh repo view --json visibility`, and `docker ps --format "{{.Names}}"`. `origin/main` = `a8c7ae569e1ae1380740230b90817679b22d465b`. No `main` worktree is listed. Local `main` is `79b8ed8`, behind `origin/main` by 99 commits. Open PR list is empty. Repository is PRIVATE.

| Worktree | Branch | HEAD | origin divergence (behind/ahead) | Uncommitted paths (names only) |
| --- | --- | --- | --- | --- |
| `LFTR` | `009-packages` | `b359985` | 0/0 | D `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.docx`; D `LIFTER_Claude_Files/LIFTER_Claude_Kickoff_Prompt.txt`; ?? `.agents/`; ?? `docs/F10_AUDIT.md`; ?? `docs/SESSION_HANDOFF.md`; ?? `opencode.json` |
| `LFTR-008` | `010-registration-links` | `385abdc` | 0/0 | clean |
| `LFTR-011` | `011-client-accounts` | `12036e2` | 0/0 | clean |
| `LFTR-011-audit` | detached | `ac50a64` | n/a | clean |
| `LFTR-011-cron` | `011-purge-cron` | `24026da` | 0/0 | clean |
| `LFTR-011-docs` | `011-docs-drift` | `1bcef13` | 0/0 | clean |
| `LFTR-012` | `012-registration-approval` | `7f2cc19` | 0/0 | clean |
| `LFTR-013` | `013-freeze-renewal-refunds` | `766e3e5` | 0/0 | clean |
| `LFTR-014` | `014-workspace-branding` | `65f69dc` | 0/1 | clean; sole ahead commit is local RED `65f69dc` |
| `LFTR-circleci` | `ci-circleci` | `f39470a` | 0/0 | clean |
| `LFTR-coderabbit` | `chore-coderabbit-config` | `3ae6011` | 0/0 | clean |
| `LFTR-docs-f11` | `docs-f11-merged` | `b109b4a` | 0/0 | clean |
| `LFTR-docs13` | `docs-production-readiness` | `be5b125` | 0/0 | clean |
| `LFTR-gov` | `docs-workflow-governance` | `84cb973` | 0/0 | clean |
| `LFTR-p2` | `015-forms-intake` | `4042b24` | 0/0 | clean |
| `LFTR-pr7` | detached | `5abb039` | n/a | clean |
| `LFTR-recovery` | `recovery-timers` | `a49d872` | 0/0 | clean |
| `LFTR-stack` | `infra-second-stack` | `d498800` | 0/0 | clean |

Other retained local branches: `s12-red-backup` at `33fd95a`, `s12-sales-backup` at `05f219c`, `p2-forms-intake-spec` at `fe781cd`, and `docs/foundation` at `b01fe57`. Nothing was deleted. `git fetch` removed stale remote-tracking ref `origin/circleci-project-setup`.

Running Docker names only:

- Stack A: `supabase_db_lifter`, `supabase_rest_lifter`, `supabase_inbucket_lifter`, `supabase_auth_lifter`, `supabase_kong_lifter`.
- Stack B: `supabase_db_lifter-stack-b`, `supabase_storage_lifter-stack-b`, `supabase_rest_lifter-stack-b`, `supabase_inbucket_lifter-stack-b`, `supabase_auth_lifter-stack-b`, `supabase_kong_lifter-stack-b`.

Not verified in this inspection: current hosted/CI run conclusions or whether any relay process is still active. No secrets were printed. No Docker/database commands other than names-only `docker ps` were run.
