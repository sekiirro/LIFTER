# PO decisions: PO full export

## MCQ 030-01 — Comprehensive export package

**Decision — DECIDED (S71-PO-6, Q4):** “* Q4: A — Async CSV archive.”

**Applied meaning:** Generate a UTF-8 CSV archive asynchronously for one selected workspace or all workspaces (platform scope remains PO-only). Use the existing jobs/outbox from spec 006 and adapt the export implementation patterns identified in the reuse audit. Bind downloads to current authenticated PO authorization and make the download short-lived. The field manifest is PROPOSED and requires per-screen PO approval before the export screen ships; no field outside the approved manifest may be exported. Existing plan PDF/Excel exports remain separate.

**Source:** `C:/Users/NEW LAP/.lifter/runs/s71-po/s71-po-6.verbatim.txt` (SHA-256 `DAA3A26C19CD1536486BCD508377FAF0EE33163B51A7C1C0E396FB7EC091F1B5`).
