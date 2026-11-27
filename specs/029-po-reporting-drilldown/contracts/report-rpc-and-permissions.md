# Contract: Reporting drill-down API and permissions

## API/RPC contract

The `/reports` service and current readers are workspace-specific; no platform aggregate reader/RPC exists. Add a new PO-only platform aggregate RPC over existing source facts and integrate it into the existing report route. It returns revenue, client, subscription, and established finance measures with month/package breakdowns. Requests include only validated period/filter/cursor fields; the server derives actor and authorized workspaces from the current session. Responses include safe aggregate/detail rows, currency, period, package identity and next cursor; no hidden foreign count or client audit detail. Invalid, unauthorized, foreign, and unknown IDs share safe denial behavior. Preserve existing WO report access while requiring a distinct PO check for platform scope.

## Role matrix

| Role              | Platform aggregate                    | Workspace detail                                                     | Client-level finance/report rows                                                   |
| ----------------- | ------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| PO                | All platform totals                   | Any authorized workspace                                             | Only fields included in the PO-approved dimension set                              |
| WO                | Denied                                | Own workspace only                                                   | Own workspace only, under existing report permissions                              |
| Trainer           | Denied                                | Denied unless an existing current permission expressly grants it     | Denied unless an existing current permission expressly grants the particular field |
| Sales             | Denied; current explicit reports only | No new cross-workspace detail; current explicitly granted scope only | No P7 raw activity or unapproved finance                                           |
| Client            | Denied                                | Denied                                                               | Self plan/status views only, not staff reports                                     |
| Anonymous/revoked | Denied                                | Denied                                                               | Denied                                                                             |

Application capability checks and DB/RPC authorization are required; a workspace identifier never grants scope. PO may access platform aggregate and any workspace per approved permissions. WO retains own-workspace report access only. Trainer and Sales receive no new capabilities. Direct API/RPC and counts are tested, not only rendered UI. Tests must prove platform total → workspace subtotal → source-row reconciliation and verify allowed and denied outcomes per role.

## Empty/error states

Empty results return a localized empty state. Denied, invalid and foreign scopes reveal no existence/count. Reader failures use the existing generic report error state.
