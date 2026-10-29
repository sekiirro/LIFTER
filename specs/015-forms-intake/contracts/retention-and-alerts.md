# F15 Retention and Alert Contract

## Retention

- Active client data remains available only under current authorization.
- The 30-day clock starts from the authoritative Closure/Refund/Deactivation fact and timestamp.
- Purge drafts, answers, correction content and any supported future attachment objects across all recoverable copies by day 30. Keep reusable templates and only legally required minimal Forms audit evidence. Never physically delete immutable financial ledger events.
- Purge operation is idempotent and uses the approved owner-only `pg_cron` control pattern. Migrations never activate the schedule.
- Hosted DB, Storage if later used, PITR, snapshots, backups and legal exceptions require documented technical/legal review before real client data. Any unresolved exception or copy beyond 30 days blocks production real-data use.

## Alerts

- Alert state contains IDs and allow-listed codes only. Names resolve at read time after current authorization.
- Initial alert: responsible Trainer, otherwise PO. If Trainer is assigned and delay persists, exactly one escalation after two hours to workspace WO and PO.
- Deduplicate logical occurrence × stage × recipient across retries, restarts and concurrent workers. Serialize against authoritative delivery timestamps to avoid false late alerts and suppress obsolete actionable alerts after resolution.
- Missing P4 delivery/responsible-Trainer evidence creates a safe operational exception, never a real late classification.
- OPEN: alert catch-up target, reassignment after initial alert, and behavior when escalation recipients are unavailable/revoked. Do not send to revoked recipients or invent a replacement rule; safe exception only. These details block real-data alert activation.
- No email/SMS/Telegram, strikes, deductions, firing or compensation changes.
