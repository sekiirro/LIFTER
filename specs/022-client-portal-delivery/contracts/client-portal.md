# Client Portal Contract

## Read model

For the authenticated client, return their delivered plan identities and published revisions only, with the latest published revision selected by default. Permit selection of another published revision of their own delivered plan. Include subscription status and end date from F13.

When F13 denies plan entitlement, omit the plan list and expose only subscription status, end date and the restricted state. Re-evaluate entitlement for every server-side plan read and export; stale client UI cannot grant access.

## Export request

Input: own delivered plan identity, currently selected published revision, requested PDF or Excel format.

Authorization: authenticated client identity + own delivery + current F13 entitlement; reuse F17/F18 authorization and export safety contracts.

Result: export of the exact selected/viewed revision. Draft, foreign-client, or restricted requests return no plan content.

## Delivery and notices

F19 Ready & Publish remains the delivery operation and transaction authority. First-plan notices use the F15 inbox. One notice per first delivery; the completing notice also states activation completion. No second inbox or delivery entity.
