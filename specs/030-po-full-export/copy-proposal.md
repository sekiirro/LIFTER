# Proposed Copy Table — PO full export

All copy is **PROPOSED**, not approved; copy approval is per screen before UI implementation.

**Field manifest — PROPOSED:** This versioned template is a per-screen PO field approval item. Candidate rows must name the entity, field key, display label, type, sensitivity, and inclusion decision. Populate and approve the candidate rows on the Reports export screen before enabling export; no field is approved by this template.

| Manifest column    | Meaning (PROPOSED)                                          |
| ------------------ | ----------------------------------------------------------- |
| Entity / field key | Stable source entity and field identifier                   |
| Display label      | User-visible column label                                   |
| Type               | Text, numeric, boolean, date/time, or identifier            |
| Sensitivity        | Classification for PO review                                |
| Inclusion decision | Include/exclude decision recorded by the PO for this screen |

**Expiry duration — PROPOSED:** The short-lived download duration is recorded and approved with this screen's field manifest; no artifact may be issued before that approval.

The manifest template is a complete approval checklist rather than an implicit field selection: each candidate field has a type and sensitivity, each row records an explicit include/exclude decision, and the manifest has a version and approval date. Formula neutralization follows the approved type; typed negative numbers remain numeric while formula-leading text is emitted as text.

| Surface          | Approval item  | Status / gate                             |
| ---------------- | -------------- | ----------------------------------------- |
| Existing Reports | Field manifest | PROPOSED; per-screen PO approval required |

| Surface          | State         | English (PROPOSED)                      | Egyptian Arabic (PROPOSED)         |
| ---------------- | ------------- | --------------------------------------- | ---------------------------------- |
| Existing Reports | Action        | Export client data                      | تصدير بيانات العملاء               |
| Existing Reports | Confirm scope | Review export scope                     | راجع نطاق التصدير                  |
| Existing Reports | Processing    | Preparing your export                   | بنجهز التصدير                      |
| Existing Reports | Ready         | Download export                         | نزّل التصدير                       |
| Existing Reports | Empty         | No client data matches this scope       | مفيش بيانات عملاء مطابقة للنطاق ده |
| Existing Reports | Error         | Export couldn’t be prepared. Try again. | مقدرناش نجهز التصدير. حاول تاني.   |
