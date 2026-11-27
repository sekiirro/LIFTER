# PO MCQs: Subscription expiry notices and scoped client list

**Authority already applied**: S71-PO-1 approves P8 and staff in-app notices for PO, relevant WO, and authorized Trainers at T-3 and expiry, plus the scoped expiring/expired list. None of these items is re-asked.

## MCQ 028-01 — Which Trainers are expiry-notice recipients and list-authorized?

**Where**: FR-003, FR-009; BRD-02 roles and F11 assignment history do not settle whether “authorized Trainers” means responsible-only or delegated staff.

A. Current responsible Trainer for the client at each send/read, and only that Trainer gets client rows. **(Recommended)** This matches the F11 responsible assignment and limits disclosure. Reassignment changes only future stage recipients; old notices remain with their original recipient.
B. Current responsible Trainer plus explicitly delegated Trainers recorded for that client. This supports collaboration but requires a PO-approved delegation source and revocation rules.
C. All Trainers with `coaching_work` in the client workspace. This uses the current broad coaching capability but exposes every expiry to workspace Trainers.

**PO choice**: PENDING-PO. Affects FR-003, FR-009, US1 scenario 4, US3 scenario 3. Independent notification persistence and PO/WO handling can proceed as specified.

## MCQ 028-02 — Subscription first observed with less than 72 hours left

**Where**: FR-006 and Edge Cases; no source says whether to backfill missed T-3 for a newly activated or newly observed subscription.

A. Send the T-3 notice immediately once, then send at expiry. **(Recommended)** Avoids silently losing the imminent-expiry stage while preserving exactly-once semantics.
B. Skip T-3 if its instant passed before the subscription became eligible; send only future stages. This avoids a late alert that may be confusing.
C. Send T-3 only if at least 24 hours remain; otherwise skip it. This introduces an explicit grace threshold.

**PO choice**: PENDING-PO. Affects FR-006 and the T-3 acceptance tests. Expiry-stage work is unblocked.

## MCQ 028-03 — Stage identity after an already-delivered notice and expiry extension

**Where**: FR-005/FR-006; S71-PO-1 specifies one notice per subscription stage but does not state whether a new expiry date opens a new stage after a prior stage was delivered.

A. One lifetime T-3 and one lifetime expiry notice per subscription; after an early notice, later extensions do not re-open that stage. **(Recommended)** Literal reading of “exactly one per subscription per stage”; simplest dedup key.
B. One per effective-expiry revision and stage; extension creates a new future T-3/expiry pair, while already delivered rows remain. This tracks each materially changed term but may create multiple notices of the same stage.
C. One notice per stage until any renewal/extension occurs, then reset both stage keys for the same subscription. This can repeat a stage but does not preserve a revision history.

**PO choice**: PENDING-PO. Affects FR-005/FR-006, dedup keys, and lifecycle acceptance tests. Before a stage fires, all options suppress obsolete due instants and recompute from the current expiry.

## MCQ 028-04 — What date window qualifies as “expiring” in the existing client list?

**Where**: FR-008, SC-005; BRD-06 requires expiring/expired reporting, but does not define the expiring window or its edges.

A. Expiring means an effective expiry instant from now through the next 72 elapsed hours, with the window inclusive at now and exclusive at the upper edge. **(Recommended)** Aligns the list with the staff T-3 stage and avoids another horizon.
B. Expiring means an effective expiry date in the next 30 calendar days using the Cairo end-boundary convention. This gives a longer planning view but is broader than the notification stage.
C. Allow PO/WO to choose a bounded horizon, defaulting to 72 hours. More flexible, but adds a visible filter and further permission/UX choices.

**PO choice**: PENDING-PO. Affects FR-008 and SC-005. The expired filter and role scoping are unblocked.
