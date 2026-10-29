# F15 Retention and Alert Contract

## Retention

- Active client data remains available only under current authorization.
- The 30-day clock starts from the authoritative Closure/Refund/Deactivation fact and timestamp.
- Purge drafts, answers, correction content and any supported future attachment objects across all recoverable copies by day 30. Keep reusable templates and only legally required minimal Forms audit evidence. Never physically delete immutable financial ledger events.
- Purge operation is idempotent and uses the approved owner-only `pg_cron` control pattern. Migrations never activate the schedule.
- Hosted DB, Storage if later used, PITR, snapshots, backups and legal exceptions require documented technical/legal review before real client data. Any unresolved exception or copy beyond 30 days blocks production real-data use.

## Alerts

- Alert state contains IDs and allow-listed codes only. Names resolve at read time after current authorization.
- Initial alert: assigned Trainer. Apply seven-day catch-up, deduplication and reassignment handling. If unresolved after 24 hours, escalate simultaneously to both Platform Owner and Workspace Owner (Q4; supersedes F15-5).
- Deduplicate logical occurrence × stage × recipient across retries, restarts and concurrent workers. Serialize against authoritative delivery timestamps to avoid false late alerts and suppress obsolete actionable alerts after resolution.
- Missing P4 delivery/responsible-Trainer evidence creates a safe operational exception, never a real late classification.
- Q4 leaves unstated: the initial alert recipient when no Trainer is assigned, and whether reassignment restarts the 24-hour clock. Do not invent these semantics. Recheck authorization and do not send to revoked recipients; real-data activation remains blocked on P4 coverage and genuinely open Q4 details.
- No email/SMS/Telegram, strikes, deductions, firing or compensation changes.
