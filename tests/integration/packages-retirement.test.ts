import { describe, it } from 'vitest';

// T076 [FR-023] RED-first planned integration test (S33-PO-6 S33-02/S33-06).
//
// STATUS: PLANNED, NOT EXECUTABLE. The retirement operation is not defined by any
// approved contract and does not exist on main:
//   - specs/009-packages/contracts/packages-surface.md and data-model.md define no
//     retirement RPC, no retired/retired_at column, no retirement audit action and no
//     actor rule (only create_package_category, publish_package_version and
//     set_package_offer_available).
//   - T054/T055/T066 (owners of the operation) are unticked and unimplemented; no
//     migration on origin/main or any origin branch contains a package retirement
//     function.
// Whether retirement is distinct from set_package_offer_available(false), its level
// (package, offer or both), reversibility, audit action and actor are product/contract
// decisions this file does not invent. Each case below is an explicit it.todo, never
// passing evidence. They become executable tests when the contract lands on an
// implementation head; this task (T076) stays unticked until they pass there.
//
// Fixtures to reuse when implemented: tests/integration/packages-fixture.ts
// (packagesFixture, publishedFixture), registration-links and client-accounts fixtures
// for an issued link, a registered client/assignment and a financial snapshot.
describe('T076 FR-023 future real package retirement (planned, contract missing)', () => {
  it.todo(
    '[T076] retiring a future real package by the contracted actor succeeds and is audited with the contracted action',
  );
  it.todo(
    '[T076] a retired package is excluded from new sales: issue_registration_link and the offer reads refuse/omit it for PO, WO and Sales',
  );
  it.todo(
    '[T076] existing client, assignment, issued-link and financial snapshots (price, currency, commission, duration, version id) are byte-identical before and after retirement',
  );
  it.todo(
    '[T076] already-issued links and the history rows keep their original version snapshot; no package/version/offer row is deleted or updated beyond the contracted retirement marker',
  );
  it.todo(
    '[T076] foreign-workspace, Sales, trainer, anon and revoked actors cannot retire (Constitution I negative tests)',
  );
});
