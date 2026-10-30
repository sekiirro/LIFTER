# F15 — P2 Forms/Intake Spec Debate

**Date**: 2026-10-29

**Status**: Complete — binding architect judgment incorporated; pending PO decisions

**Draft reviewed**: `fe781cdc0be97d4ac419898f72a5743e932ff9f2`

**Participants**: Sol Medium drafter; independent Sol Medium and Opus 5.5 critics; Claude Opus 5.5 architect as judge. One rebuttal round. Both opening critiques conclude **ready-after-fixes**.

This record summarizes the supplied opening critiques and binding architect judgment A–M. A separate rebuttal transcript was not supplied; no participant quotations, rebuttal statements or execution evidence are invented. The judgment below governs disagreements. Runtime behavior remains UNVERIFIED; debate does not approve implementation or resolve the eight PO questions in [spec.md](spec.md).

## Sol Medium critique disposition

| Point                                        | Disposition                                 | Binding reason / resulting requirement                                                                                                                          |
| -------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sol-1 Partial saves                          | Accepted                                    | Save validates supplied data/safety; completeness is submission-only (FR-008).                                                                                  |
| Sol-2 Authorization paths                    | Accepted                                    | Staff membership/capability, existing-workspace PO, signed approved client self-association and narrow internal authority are distinct (FR-020/021).            |
| Sol-3 Audited reads/privileged functions     | Accepted                                    | Every staff/client answer access fails closed on audit error; direct bypass denied, forced RLS and narrow definer grants required (FR-024).                     |
| Sol-4 Ordering and uniqueness                | Accepted                                    | Preserve F12 ordering, reauthorize after waits and enforce assignment/submission/SLA uniqueness independently of keys (FR-002/011).                             |
| Sol-5 P4 dependency gate                     | Accepted                                    | No real-data classification/alerts without authoritative coverage; missing evidence is an owner exception, synthetic testing allowed (FR-017).                  |
| Sol-6 Navigation policy                      | Accepted                                    | Preserve FINAL F12-6 automatic transition navigation and manual recovery; register only a real authorized route (FR-028).                                       |
| Sol-7 Capability names/parity                | Accepted                                    | Name actual SQL helpers, test known/unknown strings, preserve F12 Sales removal and F14 branding addition (FR-022).                                             |
| Sol-8 Global/local distinction               | Accepted                                    | Global visibility grants no global mutation/foreign data; eligibility checked before workspace copy (FR-004).                                                   |
| Sol-9 Dead-job free text                     | Accepted                                    | Persist only safe codes in `last_error` and verify all enabled logging layers (FR-025).                                                                         |
| Sol-10 Bundled questions                     | Accepted with refinement                    | Numeric limits/save timing are architect-reviewed engineering; retention consolidates into Q8, correction actors remain Q7 and general replacement is deferred. |
| Sol-11 Single-question progression           | Accepted                                    | One applicable question, backward review, recomputation and acknowledged-answer preservation are explicit (FR-026).                                             |
| Sol-12 Administration/calendar/measurability | Accepted except retaining the old directory | PO explicitly authorizes the F15 branch/directory rename; fixed D-03 removes calendar vote and gated outcomes are separated from invariants.                    |

## Opus 5.5 opening critique disposition

| Point                                             | Disposition                                    | Binding reason / resulting requirement                                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opus-1 P4 gate/scheduler                          | Accepted with refinement                       | Gate real-data behavior, not synthetic integration in every environment; pg_cron reuse is a recommendation, activation deferred (FR-017/019).                       |
| Opus-2 Concrete health protection                 | Accepted except unverified encryption reliance | Concrete health controls required; D-20 approves region only, hosted at-rest encryption UNVERIFIED pending proof, no column encryption unless PO adds (FR-023/025). |
| Opus-3 Single-question progression                | Accepted                                       | PRD-03 requires it, with explicit backward/focus/resume behavior (FR-026).                                                                                          |
| Opus-4 Consumer mechanism                         | Accepted and extended                          | One internal both-facts operation on selection/self-resolve plus bounded historical backfill; preserve F12 locks and independent uniqueness (FR-002/011).           |
| Opus-5 SQL names                                  | Accepted                                       | Use `app_private.role_has_capability` / `app_private.has_workspace_access`, not nonexistent helper names (FR-022).                                                  |
| Opus-6 PO workspace existence                     | Accepted                                       | Explicit existing `public.workspaces` join prevents PO helper bypass for nonexistent UUIDs (FR-020).                                                                |
| Opus-7 Staff-only daily-deduplicated access audit | Rejected                                       | Every staff AND client answer access is audited, without daily dedup; audit failure returns no answers (FR-024).                                                    |
| Opus-8 DST-safe deadline wording                  | Accepted as conditional recommendation         | Q2 B means first valid instant of following Cairo date; skip gaps and choose earlier overlap occurrence only if PO approves B (FR-016).                             |
| Opus-9 Pure fixed calendar                        | Accepted                                       | Store `cairo-d03-v1`; no runtime holiday/calendar governance or new source vote (FR-015).                                                                           |
| Opus-10 Workspace default selection               | Superseded by S17 PO decision                      | Your First Step is the default ordinary editable Forms template; Workspace Owners may edit, replace, or select another onboarding form. Per-form Q3=D controls audience/automation; preserve global-template governance separately. |
| Opus-11 Measurability                             | Accepted                                       | Separate gated thresholds from invariants; denial-shape parity and pre-evaluation bounds rejection required (SCs).                                                  |
| Opus-12 Source pins                               | Accepted                                       | Requested F12 `50cc77e8a0090f3baa716c3e4656b216db0983dd` and F14 `334f50190bcc78e794832fa26c0ea9d482b116c6`; rebuild from actual merged sets before implementation. |
| Opus-13 No-target-ID client paths                 | Accepted with refinement                       | No client/workspace target parameters; assignment ID allowed with signed self-ownership validation (FR-021), so absolute no-ID ban rejected.                        |
| Opus-14 Builder sequencing                        | Superseded by S17 PO decision                      | The default onboarding starter is an ordinary workspace form. No PO-only publication prerequisite applies; Workspace Owners may edit, replace, or select it. Published versions and assignment snapshots remain immutable. |

## Binding architect judgment A–M

| Judgment | Incorporated outcome                                                                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A        | Empty/partial autosave valid; submission alone enforces required applicable answers and substantive sections.                                                                                         |
| B        | Distinct staff/PO/client/internal authority, existing-workspace join, generic foreign/nonexistent denial, actual SQL/TS parity including unknown strings.                                             |
| C        | Every answer access audited fail-closed without dedup; forced RLS/narrow privileges, concrete health protections, safe errors/job codes, IDs-only alerts, backups and hosted encryption verification. |
| D        | Assign after both facts via selection/self-resolve/bounded backfill; F12-compatible locks, fresh authorization and independent original submission/SLA uniqueness.                                    |
| E        | Single-question progression, backward review/recomputation and acknowledged-answer preservation.                                                                                                      |
| F        | Pure fixed `cairo-d03-v1`, frozen submission facts, Q2 NOT DECIDED with conditional gap/overlap handling.                                                                                             |
| G        | P4 coverage gates real-data lateness; missing evidence operational exception, synthetic permitted, pg_cron recommended/activation deferred.                                                           |
| H        | FINAL F12-6 stays decided; real authorized destination, bounded transition redirect/manual fallback; concrete DS gaps to Design Gate.                                                                 |
| I        | Global/local eligibility distinction remains; S17 approves a workspace-default editable onboarding form and per-form Q3=D automation. Global reusable-template governance remains separate. |
| J        | Invariant/gated SCs, denial-shape parity, pre-evaluation bounds, requested pins and latest actual integrated migration/audit/capability sets.                                                         |
| K        | Eight mandated MVP slices, minimal publication before assignment, full builder after core intake.                                                                                                     |
| L        | Sequential Q1–Q8 map former Q1/Q2/Q3/Q5/Q7/Q8/Q9/Q10; calendar/navigation votes removed, cadence engineering/retention consolidation, replacement deferred.                                           |
| M        | Durable participant/round/disposition record without fabricated transcript or runtime evidence.                                                                                                       |

## Scope and readiness outcome

No finance, P4 activation/portal, P5 recurrence, code, migrations, database, Docker, plan or tasks is added. REQ-P2-01 remains verbatim FR-001. Eight PO questions remain open with recommendations only. B4/ND-F5-1/DP-01/02 retention blocks production real data rather than local/CI synthetic work. Design Gate evidence and implementation tests remain future obligations.
