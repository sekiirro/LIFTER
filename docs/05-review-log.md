# LIFTER — Codex Adversarial Review Log (Round 1)

Reviewer: Codex (read-only, no edits). Thread `01a17a57-604c-7a60-9865-9084af3693d4`. Round 2 not needed: no unresolved material disagreement.

| # | Objection | Sev | Claude response | Resulting change |
|---|---|---|---|---|
| 1 | RLS context via `SET LOCAL` isn't an independent wall; any SQL as the app role can widen it | HIGH | **Accepted.** RLS is a guard against bugs, not against SQL injection. Threat model now explicit. Not adopting per-tenant DB principals (cost) unless the pen-test shows need. | [02-architecture.md](02-architecture.md) § Multi-tenancy: threat model + mitigations |
| 2 | Calendar-month default for duration is an unsourced money rule | HIGH | **Accepted.** | Production-subscription gate in [03-roadmap.md](03-roadmap.md); checklist row updated |
| 3 | P0–P4 called "MVP" omits approved operating capabilities (finance reporting, check-ins, bot, payroll) | HIGH | **Accepted in part.** Renamed to *limited pilot*. Minimum workspace + PO finance reporting moved into P4. Remaining deferrals are explicit approval gates. Keeping the cut itself as a recommendation. | Roadmap P4 + totals; change #3 |
| 4 | Prisma rejection rationale is wrong (interactive transactions keep one connection) | MED | **Accepted.** Rationale removed. ORM chosen by a P0 spike against the real pooler. | Architecture stack table |
| 5 | "Creator-only edits" of global catalog is an invented permission rule | MED | **Accepted.** Rule removed; rights → NEEDS SOURCE CONFIRMATION. Versioning + snapshots keep any eventual rule safe. | Architecture § versioning; change #5; checklist |

Historical pre-S20 note: the earlier review proposed atomic paired delivery (ready was distinct from delivered). Superseded by PO S20 Message B section 4 and the spec on branch 019-plan-core (feature PR pending): first deliveries are independent and may occur on different days; activation is exactly once after both succeed. Other unresolved items remain tracked in their owning decisions.
