# Client Portal Contract

## Read model

For the authenticated client, return their delivered plan identities and published revisions only, with the latest published revision selected by default. Permit selection of another published revision of their own delivered plan. Include subscription status and end date from F13. The end date is the last covered day: F13's exclusive boundary minus one Cairo day, display only (S57-PO-5). A `refunded` summary also carries `refund_scope` (`full` | `partial`); only `full` shows the Refunded label (S57-PO-12).

When F13 denies plan entitlement, omit the plan list and expose only subscription status, end date and the restricted state. Re-evaluate entitlement for every server-side plan read and export; stale client UI cannot grant access.

## Export request

Input: own delivered plan identity, currently selected published revision, requested PDF or Excel format.

Authorization: authenticated client identity + own delivery + current F13 entitlement; reuse F17/F18 authorization and export safety contracts.

Result: export of the exact selected/viewed revision. Draft, foreign-client, or restricted requests return no plan content.

## Delivery and notices

F19 Ready & Publish remains the delivery operation and transaction authority. First-plan notices use the F15 inbox. One notice per first delivery; the completing notice also states activation completion. No second inbox or delivery entity.

Client-recipient extension (S57-PO-10):

- `app_private.f22_enqueue_client_notice(workspace_id, client_id, notice_kind, source_key) returns uuid`: callable only from postgres-owned definer code (the F19 hook, spec 023 reminders). Idempotent on `(workspace, client, kind, source_key)`; returns null and writes nothing for a client that is not an approved, active client of that workspace; raises `invalid_client_notice` (22023) for a missing argument or unknown kind. The F19 hook passes the delivery id as `source_key` and `<kind>_delivered_activated` when that delivery activated the subscription, otherwise `<kind>_delivered`.
- `read_client_notices(limit, before)`: own notices only, newest first, IDs-only rows `{notice_id, notice_kind, created_at, read_at}`; non-clients get `invalid`.
- `mark_client_notice_read(notice_id)`: own notice only; foreign or unknown ids return `not_found`; idempotent.
- Notice text is approved catalog copy chosen by kind. Notices render only when F13 grants plan access (FR-004).

## Nutrition view and export read (S57-PO-9, FR-004, FR-008; Round 5)

`client_portal_nutrition_plan(plan_id, revision_number default null)` is a client-derived, F13-gated read of one own delivered nutrition revision. It exists because the F18 content table is staff-read only and F18's exporter refuses the client role at its app wall; it adds no table, status, renderer or export engine.

- The client is derived from the signed identity (`app_private.f22_portal_client`); a non-client gets `invalid`. Anything other than a projected F13 `active` state gets `restricted` with the subscription summary only and no plan data.
- The revision is the latest delivered revision (or the requested one) of the client's own delivered nutrition plan under its resolved subscription. A foreign plan, an undelivered or draft-only plan, a workout plan id, an unknown revision and an unknown id all return the same `not_found`.
- The result carries the plan and revision identifiers, the immutable F18 `document`, `snapshot_map` and `computed_values` of that exact revision, and the client's own alternative selections for that exact revision (never another revision's or another client's).
- The app builds the F18 `NutritionExportProjection` and renders it with the F18 `renderNutritionPrintHtml` (page body, sandboxed) and the F18 `buildNutritionWorkbook` / print HTML (download), so selections, revision-specific totals and spreadsheet formula protection are F18's. Every export and denial is recorded through the existing F18 `record_nutrition_export_audit`, which already accepts the plan's own approved client; a success audit failure releases no file.
- Workout view and export stay blocked: F17's payload needs a client-authorized F16 exercise projection (exercise names and live video for alternatives) that does not exist on main.
