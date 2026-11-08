# Client Notes — Research

## Scope and source hierarchy

Behavior comes only from the final Client Notes block in `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-5.verbatim.txt`, with the earlier item 2 in `s36-po-4.verbatim.txt` quoted in `spec.md`. The final S36 PO text controls any conflict. `s36-architect-rulings-5.md` Client Notes / CN-1..4 is architectural mapping, not PO wording.

Tenant boundaries and role membership reuse the Constitution §I, `specs/003-tenancy-rls/spec.md`, `specs/004-auth/spec.md`, and `specs/011-client-accounts/spec.md`. Client Notes does not modify those existing feature scopes.

## Existing authorization facts

- F3 defines roles `platform_owner`, `workspace_owner`, `trainer`, and `sales`; unlisted role/capability pairs deny by default.
- Current workspace access uses a verified `auth.uid()`, a current staff role, active membership (`revoked_at IS NULL`) and role capability. A Platform Owner has the existing all-workspace branch.
- `coaching_work` is approved for Platform Owner, Workspace Owner and Trainer; Sales is denied.
- Client accounts are workspace-owned `public.clients` rows with composite same-workspace keys.
- The app layer's pure `authorize(actor, capability, workspaceId)` must match the database matrix. UI visibility is not an authorization boundary.
- Existing DESIGN.md §6 describes staff client details with horizontal scrollable tabs on mobile, and §11 leaves roles' detailed mobile tabs, icon library, touch sizing and exact breakpoints unresolved.

## Technical alternatives, not product choices

| Concern | Alternative A | Alternative B | Constraint |
| --- | --- | --- | --- |
| Note storage | Workspace-scoped row linked to client | Embedded JSON/text field on client | Independent entries and workspace/client composite integrity favor a row entity; PO has not selected a physical representation. |
| Read boundary | RLS on the note relation | UI/server-only check | PO expressly requires backend/RLS; UI-only authorization is invalid. |
| Edit history | Append-only versions | Update current entry | PO expressly says no version history; current-row edit is consistent with that statement. |
| Delete | Soft delete / recycle bin | Hard delete | PO expressly requires permanent hard-delete by PO only. |

## Open research / decisions

CN-MCQ-01..12 in `spec.md` carry all identified unresolved behavior, UX, retention, and presentation details. These questions are not resolved by current schemas or the cited PO words. Recommendations are advisory only. There are no implementation claims in this research artifact.
