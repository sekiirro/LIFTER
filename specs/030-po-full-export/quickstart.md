# Quickstart: PO full export

Future validation only; this spec lane ran no code/tests.

1. Resolve MCQ 030-01 and approve the field manifest before implementation.
2. Seed synthetic clients across workspaces with each candidate field, including health/fitness-sensitive values, and keep real data out.
3. RED-first test PO vs WO/Trainer/Sales/Client/anonymous; use direct API/RPC/storage IDs, foreign workspace scopes, guessed identifiers, URL replay, expired auth and revoked PO.
4. Verify scope completeness and exclusion against the manifest and source rows; no duplicates, missing fields, cross-scope rows or plan-export regressions.
5. Verify idempotent requests, response-loss retry, audit metadata, safe failures, artifact binding and expiry according to approved package.
6. Scan logs/audit/errors/storage metadata for PII, health values, secrets or file contents.
7. Verify the existing Reports page, accessible states and per-screen approved copy; record executed evidence on the implementation head.
