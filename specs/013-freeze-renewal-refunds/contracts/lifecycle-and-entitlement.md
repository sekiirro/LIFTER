# Contract: Freeze, renewal and entitlement

## Freeze

Apply accepts a 1–30 calendar-day duration against an activated subscription, permits overdue subscriptions, rejects overlap, and allows sequential freezes. The Apply Cairo date counts. Stop records the early end and credits elapsed dates excluding the Stop date (same-day Apply/Stop credits Apply day). Remove appends a reversal with zero contribution and preserves history; recomputation clamps to the first existing Cairo instant after removal and the latest delivered-access boundary. All operations bind expected lifecycle revision and are idempotent.

## Renewal and projection

Renewal reuses F12 purchase snapshots, obligations, collection/correction operations and capabilities. Renewal installment due dates anchor to Cairo recording date. Early service starts at predecessor effective end; late service starts on recording date. An unstarted renewal may shift when entitlement extends; started/delivered service facts never shift. Only one unstarted renewal may exist. Projection distinguishes awaiting activation, future, active, frozen, expired and refunded/canceled; P4 owns enforcement and notices, P5 owns check-ins.

Every concurrent lifecycle writer follows the F12 lock order and expected-revision contract. Exact race outcomes are defined in spec.md and `ledger-architecture.md`.
