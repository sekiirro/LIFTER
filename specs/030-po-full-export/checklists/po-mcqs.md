# PO MCQs: Platform Owner comprehensive client dataset export

**Authority already applied**: S71-PO-1 approves PO full export; BRD-06/PRD-11 exclude comprehensive export for WO. These decisions are not re-asked.

## MCQ 030-01 — What is the “full export” package?

**Where**: FR-003/FR-006; no source sets fields, format, sync/async generation, or download lifetime.

A. Asynchronous UTF-8 CSV archive per selected workspace or all workspaces, using a PO-approved field manifest and short-lived authenticated download. **(Recommended)** Inspectable and bounded; sensitive fields remain explicitly selected.
B. Synchronous CSV per request, limited to one workspace. Simpler but limits platform scope and may time out.
C. CSV plus JSON for selected workspaces, generated asynchronously and available for 30 days. More flexible but adds formats, storage and retention obligations.

**PO choice**: PENDING-PO. Affects FR-003/FR-004/FR-006 and the field manifest; authorization, audit and minimization proceed independently.
