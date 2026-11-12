# Contract: Freeze, renewal and entitlement

## Freeze

Apply accepts a 1–30 calendar-day duration against an activated subscription, permits overdue subscriptions, rejects overlap, and allows sequential freezes. The Apply Cairo date counts. Stop records the early end and credits elapsed dates excluding the Stop date (same-day Apply/Stop credits Apply day). Remove appends a reversal with zero contribution and preserves history; recomputation clamps to the first existing Cairo instant after removal and the latest delivered-access boundary. All operations bind expected lifecycle revision and are idempotent.

## Renewal and projection

Earlier successor-row renewal descriptions are historical implementation behavior, superseded where incompatible by S43-PO-5. Current continuous-subscription lifecycle behavior is specified in the S43-PO-5 contract section below; retain F12 payment facts and installment recording-date anchors only where compatible. Projection distinguishes awaiting activation, active, frozen, expired, and refunded/canceled; P4 owns enforcement and notices.

Every concurrent lifecycle writer follows the F12 lock order and expected-revision contract. Exact race outcomes are defined in spec.md and `ledger-architecture.md`.

## S43-PO-5/6 lifecycle contract (2026-11-10)

PO source: exact S43-PO-5 item lines 1 through 11 and S43-PO-6 lines are in spec.md under Clarifications / PO-decision register. Architect interpretation is separate: **architect mapping (S43-R6/R7/R8)**.

**architect mapping (S43-R7):** One continuous subscription per client. Same-rank longer or higher-rank packages qualify; equality is free and lower-price choices are refused; full paid credit is never prorated. Same-rank longer and higher-rank equal/longer starts from original start, except after an expired renewal when the renewal start date is the anchor; upgrades require the same currency and refuse mixed-currency choices before writes without conversion; higher-rank shorter starts on upgrade date; for any pre-activation upgrade the duration starts at activation, overriding those calendar anchors until activation occurs. If a renewal precedes an upgrade, credit only the original package payment, including when an earlier upgrade occurred; exclude prior upgrade charges and separate renewal payments, and preserve the renewal duration/payment. Full refunds cover the selected package payment including upgrade charges; separate renewals are not automatically refunded. Upgrade revenue is additional payments only. Initial activation is written once; renewal and upgrade append lifecycle/ledger events without new activation rows. Frozen/expired rules, manual PO date edits, and productivity behavior remain as already specified.

### Testable operation outcomes

- Upgrade: same-tier longer uses original start; higher-tier shorter uses upgrade date. Equal price is accepted at zero charge/revenue; lower price is refused before writes. Higher-tier equal/longer uses original start; rank order is fixed Silver < Gold < Platinum; pre-activation duration starts at activation (S43-PO-6; architect mapping (S43-R7)).
- Renewal before initial activation is refused with no writes or queued duration. After activation, active expiry plus full duration; expired renewal starts today plus duration and records full renewal revenue. Frozen state rejects upgrade and renewal without writes. Freeze extends expiry by counted days. If renewal precedes an upgrade, credit only the original package payment even when an earlier upgrade occurred; exclude earlier upgrade charges and separate renewal payments.
- Renewal then upgrade: credit only the original package payment and preserve separately paid renewal duration and payment, including when an earlier upgrade preceded that renewal; exclude earlier upgrade charges and the separate renewal payment from the upgrade credit. Full refund covers selected package payment including upgrade charges; separate renewals are not automatically refunded (S43-PO-6; architect mapping (S43-R7)).
- Manual dates: only Platform Owner; include expired subscriptions; audit each change and record no revenue.
- Refund: use full-package basis, never only upgrade difference.
- Points/plans: one point per new client once, none for returning client, renewal, upgrade, or publication; eligible clients may receive unlimited revisions/publications.
- Concurrency: retain expected-revision, authorization-recheck, exact-replay and stale-request behavior; rejected operations produce no subscription/payment/revenue/audit writes.

### S51-PO-1 upgrade settlement and audit contract

PO source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-1.verbatim.txt`, SHA-256 `3800b4dac13b8b17e5b72f83ea46d21a0e9e652c513ab2dfd4ef70d9ca751e7a`; architect mapping is S51-R7. This supersedes S50-PO-6 F13=C and S50-R32 on replacement/repricing.

An upgrade is permitted only if every existing subscription installment is fully settled and no payment is pending/in flight. After acquiring the existing subscription/obligation locks, revalidate this state; reject an unsettled or pending payment before any write. Collect the full upgrade price difference upfront before the upgraded term activates. Do not create upgrade installments or a new installment schedule. Preserve all existing financial history and the single continuous subscription. Record one upgrade-linked audit fact with bounded non-PII identifiers, amount, and currency, representing the upgrade without installment replacement. Calculate Platform Owner commission only on actual collection using the original subscription's stored `commission_rate_bp`; trainers receive no commission. Reject before writes if collected amounts exceed the remaining balance, an expected-unreachable guard. Successful receipt field selection remains open as S51-F13-MCQ-9/-10; no receipt-shape change is specified here pending S51-F13-MCQ-9/-10.

### S43-R8 activation event rule

**architect mapping (S43-R8):** The subscription has one activation row, written on initial activation (automatic or PO Override). Renewal and upgrade write their own immutable lifecycle/ledger events and do not write a new activation row. Retire activation_source = 'renewal' for new writes; historic dev rows are disposable mock data. Renewal still restores/extends access when recorded.
