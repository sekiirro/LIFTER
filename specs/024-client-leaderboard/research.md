# Research: Client Leaderboard (F24)

## Scope and evidence

Research uses the current repository contracts and the read-only F11/F23 source check. The source precedence is PO S55-PO-9 / S55-PO-6 / S55-PO-3, then earlier PO decisions, then BRD/PRD. Username validation rules are defined by S55-PO-9 Q14.

## Decisions

### Username lifecycle

- Decision: The client selects the username in the F11 invitation-link signup. Reuse an existing field if one exists; otherwise add the field to that form. Enforce uniqueness within a workspace and allow later client edits.
- Rationale: Directly implements S55-PO-6 Q11 and keeps the existing F11 signup boundary intact. F11's `client_signup` surface already accepts validated signup fields through a bounded transaction.
- Alternatives considered: a separate username registration flow, staff assignment, global uniqueness, or a new account lifecycle. Rejected because they conflict with the answer or redesign F11.
- Username validation (S55-PO-9 Q14): F11 has no username-specific convention; apply 3-20 characters, English letters (A-Z), digits, underscores and dots only; case-insensitive workspace uniqueness; reserved names (admin, support, lifter, trainer, owner) blocked case-insensitively. Reuse the F11 validation/RPC seam.

### Monthly incumbents and approval

- Decision: Re-score past winners and new candidates using current-month data. Replace a past winner only when a new candidate's current score is higher. Preserve the current approved list until the PO approves its successor.
- Rationale: S55-PO-6 Q12 explicitly defines both comparison inputs and the client-visible approval boundary.
- Alternatives considered: compare against a winner's historical score or publish a changed list before PO approval. Both contradict Q12.

### Opt-out

- Decision: The client opts out in account settings. Remove their row from the currently visible list immediately and exclude them from later results; audit the action.
- Rationale: S55-PO-6 Q13 settles the action, timing, and audit behavior. Immediate opt-out applies even when an approved result is otherwise retained while a successor awaits approval.

### Adherence and goal progress

- Decision: Consume `workoutAdherence` and `dietAdherence` by name from spec 023, each a 0?10 integer, and average them as the adherence input. Consume normalized goal-relative baseline improvement by goal type from spec 023. Combine adherence and progress 50/50.
- Rationale: S55-PO-3, S55-PO-5 and spec 023 FR-037; spec 023 is read-only in this feature. Do not expose the inputs, weights, or formula to clients.

### Reuse and privacy

- Decision: Reuse F13 entitlement/freeze data, F15 check-in answers, F19 plan delivery facts, spec 003 tenant/RLS boundaries, spec 005 audit, F11 signup, F21 staff display names, and spec 022 account-settings conventions where present.
- Rationale: Their contracts own the underlying lifecycles and access patterns. The current checkout has no spec 022 contract artifact, so this plan does not invent one.
- Alternatives considered: duplicate eligibility, scheduling, audit, or staff identity storage. Rejected by the feature's reuse requirements.

## Constitution check inputs

- Principle I: workspace isolation, deny-by-default, app and database authorization walls, negative foreign-workspace coverage.
- Principle III: least privilege; PO alone makes final publish/reject decision.
- Principle IV: only approved behavior; S55-024-Q14 is resolved by S55-PO-9.
- Principle VII: minimize health data and exclude it from logs and display.
- Principle VIII: bilingual accessible UI and Design System use.
- Principle IX: approval, username uniqueness/edit, and opt-out transitions must be concurrency-safe and idempotent.
- Delivery constraints: feature remains dark behind a server-side default-OFF flag if merged unfinished; the flag mechanism must first be defined in its own small spec/PR.
