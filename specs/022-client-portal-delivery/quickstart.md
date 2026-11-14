# Quickstart: Client Portal Delivery Validation

Use the repository's existing development environment and seeded workspace fixtures. Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production. Keep authorization/RLS active.

## Validation scenarios

1. **Dark by default**: start with no flag override; portal and directory feature paths are unavailable while existing app routes remain functional.
2. **Independent delivery**: publish first workout and nutrition plans on separate days; verify each delivery appears once and the completing delivery activates once and sends the second notice.
3. **Client projection**: as a client, list only own delivered plans, choose older published revision, and verify that export uses the selected revision.
4. **Entitlement change**: deny F13 entitlement after page load; a fresh read/export returns no plan content and the restricted projection exposes only status, end date and restricted state.
5. **Directory query**: search each of name/email/phone/client code; filter each of the three approved dimensions; verify the three indicators link into existing owning surfaces.
6. **Workspace isolation**: repeat searches and exports with two workspaces; foreign client data and existence remain undisclosed.
7. **Export safety**: verify F17/F18 output fields, nutrition selected alternatives/totals and formula-injection neutralization.
8. **Feature completion**: run repository-required lint, typecheck, format, unit, touched integration and e2e suites on the final slice head; after cumulative feature review and completion, follow the approved feature-completion requirements.

Commands and fixture setup follow repository CI and current F11/F13/F15/F17/F18/F19 contracts; no new database reset or migration is required by this specification.
