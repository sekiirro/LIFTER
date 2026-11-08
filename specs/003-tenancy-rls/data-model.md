# Data Model: P0-F3

## `staff_role` enum

`platform_owner | workspace_owner | trainer | sales`

## `public.staff_profiles`

| Column | Type | Rules |
|---|---|---|
| user_id | uuid PK | FK → `auth.users(id)` ON DELETE RESTRICT |
| role | staff_role NOT NULL | One per user |
| created_at | timestamptz NOT NULL default now() | |

RLS: SELECT where `user_id = (select auth.uid())` OR PO. INSERT/UPDATE: PO only. No DELETE.

## `public.workspaces`

| Column | Type | Rules |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| name | text NOT NULL | 1–120 chars (CHECK) |
| slug | text NOT NULL UNIQUE | `^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$` (CHECK) |
| created_at | timestamptz NOT NULL default now() | |
| created_by | uuid NOT NULL | FK → staff_profiles(user_id); default `auth.uid()` |

RLS: SELECT if `app_private.has_workspace_access(id, null)`. INSERT/UPDATE: PO only. No DELETE.

## `public.workspace_memberships`

| Column | Type | Rules |
|---|---|---|
| id | uuid PK default gen_random_uuid() | `UNIQUE (workspace_id, id)` |
| workspace_id | uuid NOT NULL | FK → workspaces(id) |
| user_id | uuid NOT NULL | FK → staff_profiles(user_id) |
| granted_at | timestamptz NOT NULL default now() | |
| granted_by | uuid NOT NULL | FK → staff_profiles(user_id) |
| revoked_at | timestamptz NULL | Once set, immutable |
| revoked_by | uuid NULL | Set together with revoked_at (CHECK both null or both non-null) |

Partial unique index `(workspace_id, user_id) WHERE revoked_at IS NULL`.
Trigger `memberships_guard` (BEFORE UPDATE): only `revoked_at`/`revoked_by` may change, only from NULL, `revoked_by` must equal `auth.uid()`, and `revoked_at` must be within ±5 minutes of `now()` (or forced to `now()`). Any other change raises an error.
RLS: SELECT if `user_id = (select auth.uid())` OR PO. INSERT: PO only, with `granted_by = auth.uid()`. UPDATE: PO only. No DELETE.

## Helpers (`app_private`, SECURITY DEFINER, `search_path = ''`)

- `is_platform_owner() returns boolean`
- `current_staff_role() returns public.staff_role` (null when none)
- `role_has_capability(r public.staff_role, cap text) returns boolean` (IMMUTABLE, matrix in research.md; unknown → false)
- `has_workspace_access(ws uuid, cap text default null) returns boolean`: a non-null `cap` must pass `role_has_capability(current_staff_role(), cap)` for every caller, the PO included (migration `20261027140000`). A null `cap` checks workspace access only. Workspace access means the PO, or an active membership of `auth.uid()` in `ws`. A null `auth.uid()` → false.

Platform Owner access is derived from `staff_profiles.role` only (`is_platform_owner`). The atomic demotion on membership revocation of S36-Q1 option (a) and S36-Q2 = C is superseded and removed by S37-PO-3 and S37-PO-4; no membership revocation writes `staff_profiles.role`. Whether a membership revocation removes Platform Owner access is open (S37-Q5). A revoked non-PO membership grants zero access (FR-016a). A revocation or ownership change creates no membership row (FR-016b). Stale-session authorization is blocked by the existing per-request re-read, with no new mechanism (S37-Q1 resolved). An ownership change is recorded as: authorize a replacement Platform Owner first, then safely delete the old account; the deletion mechanism is open (S37-Q4). No table or column is added.
