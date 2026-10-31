# F13 Spec Debate — final architect judgment

**Date**: 2026-10-29

**Feature**: [F13 specification](spec.md)

**Status**: Spec Debate complete; pending PO decisions. This record applies the architect's binding judgment, not implementation or policy approval.

## Participants and record boundary

- Drafter: Sol Medium, original draft `1b8f7a8`.
- Independent critics: Sol Medium and Claude Opus 5.5; both opening verdicts were **ready-after-fixes**.
- Rebuttal: one round. The supplied final judgment summarizes that round; no separate verbatim rebuttal transcript is asserted here.
- Judge: Claude Opus 5.5, architect. Final judgment A–L supplied for this edit is binding and resolves disagreements below.
- Inputs: Sol opening `f13-sol.md`, Opus opening `f13-opus.md`, original draft and final architect judgment. Filenames identify the supplied inputs without embedding machine-local paths.

Reverified dependency baselines: F12 `50cc77e8a0090f3baa716c3e4656b216db0983dd`; F14 `334f50190bcc78e794832fa26c0ea9d482b116c6`. F14's remote later advanced; this edit deliberately uses the judgment's pinned baseline. F12 model SQL was inspected read-only, never applied.

## Sol opening — disposition of every finding

| Finding | Judgment | Reason / resulting requirement |
| --- | --- | --- |
| S1 — freeze versus installment dates | Accepted | Final F12-8 fixes initial activation/due dates; freeze cannot shift either (FR-010/022). |
| S2 — renewal activation versus stacked start | Accepted | Immediate activation is source-settled; separate service start preserves D-04 remainder (FR-012/013). |
| S3 — successor reflow/history | Accepted with bound | Only unstarted successor reflow, never actual start/delivered access; conflicting adjustment rejects atomically; MVP at most one future purchase. |
| S4 — database authorization contract | Accepted with refinement | Existing record_payment/manage_freeze/record_refund suffice; no new capability, both walls and hardened definer grants, preserve F12/F14 matrix changes. Installment-renewal schedule rights wait for later scope. |
| S5 — terminal refund changes every interpretation | Accepted | New refund_reversal kind, separate unique cancellation fact, terminal deferred checks and all reader/audit/correspondence extensions are coordinated. |
| S6 — corrected-history amount already settled | Accepted with final invariants | Refund all active collection tails including recollections; zero-net monetary refund rejected, terminal never reopens, no extra reconciliation default. |
| S7 — reviewable concurrency outcomes | Accepted | Client first, subscriptions stable ID order, obligations sequence, ledger tail; fixtures specify winner and exact stale_state/not_permitted/key_conflict outcomes. |
| S8 — Cairo instant resolution | Accepted | Cairo date boundaries resolve to first existing instant, gap forward/fold earliest; fixtures give expected UTC instants and conditional day credit. |
| S9 — operational scrub/retention boundary | Accepted | Bounded error codes only, including jobs.last_error copied by F11 audit; no lifecycle/ledger/receipt/audit purge pending retention. |
| S10 — independent slices/order | Accepted with refinement | Only affected policy slices wait; order migrations after F12/F14 files merged at implementation time, not every unmerged F14 deliverable. |

## Opus opening — disposition of every finding

| Finding | Judgment | Reason / resulting requirement |
| --- | --- | --- |
| O1 — architecture/traceability sources | Accepted with correction | Architecture v3 is binding, but F12 supersedes more than ledger naming: correction chain, activation gating and permissions too; proposed AT IDs map to SC coverage. |
| O2 — refund month/date | Partially accepted | Refund-month posting is settled; authoritative refund date when recorded late remains ND-12, recommendation Cairo recording date/no external date for MVP. |
| O3 — P4 ownership | Accepted | P4 owns enforcement/resume/notices; F13 projection/overdue input only; conflicting F12 exclusion is an F12 doc fix. |
| O4 — missing renewal payment-terms source | Accepted | Full-price single payment is MVP recommendation under ND-16; installment renewals require a later agreement/anchor contract. |
| O5 — capability reuse/correction collision | Accepted | No new capability; record_refund requires explicit platform_owner and own-operation kind at both walls, separate from F12 correction. |
| O6 — terminal ledger and cancellation | Partially accepted | New terminal kind and separate unique cancellation fact accepted; leaving F12 alternation/chain guards unchanged is rejected because the existing checks cannot represent terminal refunds. |
| O7 — lock order by starts/id | Rejected in part | Client lock accepted; derived service-start ordering rejected in favor of stable subscription IDs to avoid reflow changing lock order. |
| O8 — Cairo date storage | Accepted with resolver | Dates/days accepted; plain midnight conversion is insufficient at DST gaps/folds, so first-existing/earliest resolver is binding. |
| O9 — settle frozen plan/export access | Not adopted as decided policy | Retain ND-14 confirmation of the D-05 reading; recommendation restrict plans/export while preserving login/settings, P4 implements. |
| O10 — freeze removal authority | Accepted | PO/WO/Sales authority is fixed for Apply/Stop/Remove; only post-completion/expiry applicability remains ND-04. |
| O11 — removal meaning/closure delivery | Accepted | PO-only pseudonymization retains ledger/audit, separate closure feature after B4; remove F13 ownership question. |
| O12 — activation dependency/slice order | Accepted; renewal seam superseded by S22-PO-5 | Refund needs no activation; P4 retains initial activation and client/plan access. S22-PO-5 resolves F13: `record_renewal` atomically records renewal activation, and service-date-gated freeze/shift is implemented in F13. |
| O13 — PO/WO receipts include commission | Rejected | F12 contract keeps every receipt/result commission-free; PO/WO use separate commission reader, common audit also excludes commission. |
| O14 — function hygiene/internal grants | Accepted and strengthened | Owner postgres, SECURITY DEFINER/search_path empty/qualified names, revoke all four application-role defaults then narrow grants; internal seams never authenticated. |
| O15 — drifted pins | Superseded by exact judgment pins | Use reverified F12 50cc77e model migration and F14 334f501, rather than opening-review pins or later moving heads. |
| O16 — concrete traceability/testability | Accepted | SCs map AT-FIN-09/10, AT-FRZ-01..04, AT-REN-01, AT-EXP-01/02 and AT-KPI-03; add exact calendar/race/terminal expectations. |

## Final judgment A–L applied

| Item | Applied outcome / location |
| --- | --- |
| A — sources and pins | Architecture/traceability precedence in authority section; exact F12/F14 pins, model migration/guards reverified; SC-001/003/004/010/012/013 map all requested AT IDs. |
| B — source-settled decisions | Ownership/binding resolutions and FR-002/005/010/012/014/017/021/027/028; no grace/P4/removal/posting-month/active-tail/authority questions reopened. |
| C — ledger design | FR-014..021, dependency/guard inventory: refund_reversal terminal kind, shared reversal uniqueness, unique cancellation fact, deferred terminal integrity, every reader/guard/audit updated forward. |
| D — receipt privacy | FR-023/029/030 and SC-010: no receipt/result commission for any role; separate PO/WO reader only. |
| E — concurrency | FR-024/025 and exact race table, including both correction/refund orders, renewal competition, activation/refund, revoke/replay and cross-target keys. |
| F — Cairo boundaries | FR-004/022/027 plus expected DST/gap/fold instants, Nov date credit examples and leap-day fixture; credit remains conditional on ND-03. |
| G — successor reflow | FR-009/012/025: unstarted only, no actual-start/access rewrite, atomic conflict rejection, at most one future renewal. |
| H — security hygiene | FR-001/029/033 and guard inventory: real workspace for PO, forced RLS/grants, hardened functions/internal seams, bounded error codes, clients UPDATE guard amendment warning. |
| I — ordering/slice independence | FR-034 and coordination: latest merged F12/F14 files and integrated audit/TS/role_has_capability bodies; no fictional helper name or global policy blocker. |
| J — MVP slices | Refund → internal projection → F13 freeze and renewal under S22-PO-5 → later P4 initial activation/access and broader scope. S22-PO-5 supersedes the earlier P4-writer dependency for F13 renewal activation and service-date-gated freeze; it grants no client/plan access. |
| K — final PO questions | ND-01/02/03/04/05/06/08/12/13/14/16 only, NOT DECIDED with options/recommendations; settled/deferred questions removed. |
| L — record/status/checklist | This record, required draft status and updated requirements checklist; no code/DB/plan/tasks/PR. |

All judgment items were applied. An accepted finding means a specification change, not a product test pass. P4/P5 AT integration outcomes remain unclaimed until their consumers exist. Unresolved PO questions block only their own slices; independent planning and later implementation approval are distinct gates.
