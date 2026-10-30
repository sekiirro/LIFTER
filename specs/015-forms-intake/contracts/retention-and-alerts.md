# F15 Retention and Alert Contract

## Retention

- Active client data remains available only under current authorization.
- The 30-day clock starts from the authoritative Closure/Refund/Deactivation fact and timestamp.
- Purge drafts, answers, correction content and any supported future attachment objects across all recoverable copies by day 30. Keep reusable templates and only legally required minimal Forms audit evidence. Never physically delete immutable financial ledger events.
- Purge operation is idempotent and uses the approved owner-only `pg_cron` control pattern. Migrations never activate the schedule.
- D1's approved automatic branch erasure is separate from relationship-end purge: it removes every answer value currently inapplicable under authoritative answers across versions and the same answer's answer-change/access-view audit rows. A held erasure can resume after hold release without requiring another branch change. Legal hold defers erasure and alerts without selecting targets. The counts-only control record contains no IDs, answer content is never logged, and every recoverable copy must be purged within RET-3's 30-day maximum.
- D1 never selects financial, authentication, authorization, security, unrelated-client, other-tenant or unrelated audit records. It is tenant-isolated, idempotent and fail-closed. No human or service-role direct delete/trigger path exists. Exact DB implementation waits for F12/F14 merge and Stack D.
- Hosted DB, Storage if later used, PITR, snapshots, backups and legal exceptions require documented technical/legal review before real client data. Any unresolved exception or copy beyond 30 days blocks production real-data use.

## Alerts

- Alert state contains IDs and allow-listed codes only. Names resolve at read time after current authorization.
- **Trainer-late (D-03):** Preserve the existing F15 Q4 rules exactly: seven-day catch-up, deduplication, assigned Trainer initial alert, reassignment handling, and simultaneous PO+WO escalation after 24 hours unresolved.
- **Client-late (D2/D3):** Alert assigned Trainer 24 hours after the client-submission deadline; alert PO+WO 48 hours after that deadline. With no assigned Trainer, alert PO+WO. Reassignment transfers the Trainer alert without resetting the clock. Deliver only to whichever PO/WO remains authorized. Every recurring occurrence has its own deadline.
- Deduplicate logical occurrence × stage × recipient across retries, restarts and concurrent workers. Serialize against authoritative delivery timestamps to avoid false late alerts and suppress obsolete actionable alerts after resolution.
- Missing P4 delivery/responsible-Trainer evidence creates a safe operational exception, never a real late classification.
- Recheck authorization and do not send to revoked recipients. Real-data activation remains blocked on complete authoritative P4 coverage.
- No email/SMS/Telegram, strikes, deductions, firing or compensation changes.


## S14 sex data and health notice

The Basic sex answer is personal data used only to select the standard N12 reference series (`male` or `female`); `male-cinematic` is unused. Protect it under the same authorization, no-store, audit-redaction, retention, and erasure controls as the related sensitive intake profile. Never place the sex value in logs or audit payloads. Apply approved retention/purge rules, including all-copy deletion within the approved 30-day window where applicable. The separate health-data notice appears before health questions and has no acknowledgment checkbox or consent receipt.
