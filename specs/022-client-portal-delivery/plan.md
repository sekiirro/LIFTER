# Implementation Plan: Client Portal Delivery

**Branch**: `022-client-portal-delivery` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

## Summary

Deliver independent workout/nutrition plans through F19, expose the client's own delivered plans and authoritative subscription/entitlement state, reuse F15 notifications and F17/F18 exports, and add an authorized staff directory with defined existing-data search/filter fields. For the directory, normalized username search is available to every staff role within existing row visibility; client-code search/output and assignment filter/state are limited to Platform Owners and Workspace Owners of that workspace (S70-PO-1 item 1; S70-PO-2). Implementation is a sequence of vertical slices; Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production. The feature gets one AI review on the cumulative completed-feature diff.

## Technical Context

**Language/Version**: TypeScript (repository app/runtime); PostgreSQL via Supabase contracts already owned by F13/F15/F19.
**Primary Dependencies**: Existing Next.js application, Supabase auth/RLS and F13, F15, F17, F18, F19, F11 and F20 contracts.
**Storage**: Existing tenant-scoped records and projections, plus one tenant-scoped client notice record (`app_private.client_inbox_notices`) that extends the F15 in-app inbox to client recipients (S57-PO-10). Composite `(workspace_id, client_id)` keys, forced RLS, no API table privileges; access only through client-only definer RPCs and one server-side enqueue seam.
**Testing**: Repository unit, integration, and end-to-end suites; workspace-isolation negative cases and export safety checks.
**Target Platform**: Web application and server-side services.
**Project Type**: Web application.
**Performance Goals**: No numeric target specified in source requirements; directory and portal interactions must return authorized results correctly.
**Constraints**: Server-side authorization and database RLS remain mandatory. Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production. Reuse existing contracts; no duplicate lifecycle, delivery, inbox, export, identity, or notes systems. Approximately 400 to 800 changed lines per vertical slice; merge origin/main before each slice. No implementation-time invention of product behavior or copy.
**Scale/Scope**: Five user stories; 13 functional requirements; one feature with multiple independently reviewable slices.

## Constitution Check

**Checked against Constitution 1.17.0 (merged from origin/main; re-checked 2026-11-15 after the S57 decisions).**

- Workspace isolation and deny-by-default authorization: PASS; enforce at app and database walls, including search/export.
- Privacy and sensitive export audit: PASS; use existing F13/F17/F18 policies and audit contracts.
- Approved scope and reuse: PASS; directory facets are now explicit; no new states or duplicate owners.
- Vertical slices: PASS; tasks are grouped by user journey and sized as small slices.
- Unfinished feature behavior: PASS. Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production. Authorization/RLS remain mandatory.
- AI review: PASS; exactly one AI review on the cumulative feature diff at completion, with blocking findings handled under Constitution 1.17.0.
- Finance, migrations, and security: PASS; no new finance rules. Forward-only migrations add read RPCs, the client notice record and a read-only F13 refund-scope helper that applies F13's own per-obligation refund rule (S57-PO-12); no F13/F15/F17/F18/F19 object is altered. Existing controls remain active.

## Project Structure

### Documentation (this feature)

````text
specs/022-client-portal-delivery/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- contracts/
|   |-- client-portal.md
|   |-- staff-client-directory.md
|-- quickstart.md
|-- tasks.md


### Source Code (repository root)

```text
app/                       # Existing Next.js routes and UI
lib/                       # Existing server policies and Supabase access
supabase/                  # Existing schema/RLS; F22 read RPCs, client notice record, refund-scope helper
 tests/                    # Existing unit, integration and e2e suites
````

**Structure Decision**: Extend the existing web app, server policy modules and tests in their current locations. Do not establish another project or duplicate F11/F13/F15/F17/F18/F19/F20 ownership.

## Constitution Check after design

PASS. Research, data model, contracts, quickstart and tasks preserve the stated reuse boundaries. The only new persistent entity is the client notice record that S57-PO-10 assigns to P4; it adds no authorization exception. Feature flags are cancelled while LIFTER is not live (PO S56-PO-4). The plan body uses the F17/F18 shared views (S57-PO-9); delivery/activation notices wait for the F19 hook (S57-PO-10); the override unit follows F19 (S57-PO-11).

## Complexity Tracking

No constitution violations.
