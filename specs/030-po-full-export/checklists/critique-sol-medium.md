# Independent Critique — Sol Medium

**Date**: 2026-11-27 (UTC)
**Reviewer**: OpenAI Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`; independent read-only Spec Kit critique.
**Scope**: 030 spec artifacts and cited repository sources.
**Result**: 0 CRITICAL, 0 HIGH, 0 MEDIUM open after corrections.

## Findings and corrections

1. **HIGH — Artifact URL could bypass current authorization** (`contracts/export-api-and-permissions.md`, retrieval). The prior bearer/public URL exception contradicted current-actor and revocation requirements. **Addressed**: all retrieval is authenticated and rechecks current PO authorization, actor, scope and expiry; no bearer/public URL bypass is permitted.
2. **MEDIUM — Shared report reader is PO and WO** (`spec.md`, `plan.md`, tasks). **Addressed**: export-specific PO-only guard at app and reader/storage boundaries; regression-test WO workspace reports.
3. **MEDIUM — Lifecycle tests followed implementation** (tasks). **Addressed**: idempotency/snapshot/replay/artifact RED tests now precede implementation.
4. **MEDIUM — Task specificity and story labels** (tasks, plan). **Addressed**: tasks now label user stories and identify existing route/view/reader/RPC/test extension points; require exact tests before execution.
5. **MEDIUM — Arabic copy encoding** (`copy-proposal.md`). **Not reproduced**: UTF-8 inspection shows legible Arabic strings; copy remains proposed pending per-screen PO approval.
6. **MEDIUM — RTL and responsive UI evidence** (tasks, quickstart). **Addressed**: task acceptance now requires AR-RTL/EN-LTR evidence across light/dark, mobile/desktop and relevant states.

The critique also flagged the authorization exception as a Constitution conflict. Removing that exception restores the stated current-authorization guarantee; no Constitution amendment is required.

## Severity counts

CRITICAL: 0 · HIGH: 0 open · MEDIUM: 0 open. Findings fixed: 1 HIGH, 5 MEDIUM; Arabic encoding finding verified not present.
