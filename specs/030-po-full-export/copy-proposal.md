# Proposed Copy Table — PO full export

All copy on the Reports export screen is **APPROVED (S71-PO-12)** as written (CB-P8-03; source: `C:/Users/NEW LAP/.lifter/runs/s71-po/s71-po-12.verbatim.txt`, SHA-256 `C4150E0E4F2948B0E70DCA31CBA122BEE043DCE0379CB9B47161227F1EEFBF87`).

**Field manifest — APPROVED (S71-PO-12):** The 15-field manifest (14 non-health fields plus fitness goals; health notes excluded) is approved under S71-PO-12.

| Manifest column    | Meaning                                                     |
| ------------------ | ----------------------------------------------------------- |
| Entity / field key | Stable source entity and field identifier                   |
| Display label      | User-visible column label                                   |
| Type               | Text, numeric, boolean, date/time, or identifier            |
| Sensitivity        | Classification for PO review                                |
| Inclusion decision | Include/exclude decision recorded by the PO for this screen |

**Expiry duration — PROPOSED:** The short-lived download duration is recorded and approved with this screen's field manifest; no artifact may be issued before that approval.

The manifest template is a complete approval checklist rather than an implicit field selection: each candidate field has a type and sensitivity, each row records an explicit include/exclude decision, and the manifest has a version and approval date. Formula neutralization follows the approved type; typed negative numbers remain numeric while formula-leading text is emitted as text.

| Surface          | Approval item  | Status / gate                                                    |
| ---------------- | -------------- | ---------------------------------------------------------------- |
| Existing Reports | Field manifest | APPROVED (S71-PO-12); 15 approved fields (health notes excluded) |

| Surface          | State         | English (APPROVED (S71-PO-12))          | Egyptian Arabic (APPROVED (S71-PO-12)) |
| ---------------- | ------------- | --------------------------------------- | -------------------------------------- |
| Existing Reports | Action        | Export client data                      | تصدير بيانات العملاء                   |
| Existing Reports | Confirm scope | Review export scope                     | راجع نطاق التصدير                      |
| Existing Reports | Processing    | Preparing your export                   | بنجهز التصدير                          |
| Existing Reports | Ready         | Download export                         | نزّل التصدير                           |
| Existing Reports | Empty         | No client data matches this scope       | مفيش بيانات عملاء مطابقة للنطاق ده     |
| Existing Reports | Error         | Export couldn’t be prepared. Try again. | مقدرناش نجهز التصدير. حاول تاني.       |
