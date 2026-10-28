# Contract: Storage CI and UI surfaces

## Required Storage CI lane

- A required CI lane enables Storage and waits for explicit readiness checks before running any Storage test.
- Zero Storage-related skips are permitted. A missing service, missing readiness signal, or skipped security case fails the lane.
- Run F11 pending-client Storage denial scenarios alongside F14 bucket/path policy cases, including direct API attempts. Use isolated fixtures and restore stack state even after failure. Update F11 isolated-runner restoration assumptions as coordinated work.
- Include unit and contract coverage for validation, state reconciliation, revision races, proxy authorization, and browser-facing surface states. DB/Storage integration work runs only on stack B.

## Proxy/validator acceptance gate

- Before the proxy or validator units are accepted, prove on the pinned local stack-B version that externally pre-issued restricted-role JWTs, verified request headers, transaction-local context and the exact Storage operation reach the `storage.objects` RLS policy.
- Prove missing/spoofed context, role-only access, visitor-token-only access, pooled-connection context reuse, list/sign/transform calls and unrelated RPC/table access fail closed. Prove direct authenticated download succeeds only for the exact handle-bound object.
- If stack B cannot prove these behaviors, stop and return to the architect. Do not fall back to anonymous SELECT, a project-wide privileged credential, signed URLs or another unapproved mechanism. Hosted compatibility remains a production blocker until separately verified.
- The gate is a prerequisite for acceptance of U03 validator promotion, U04 validated-object policy, and U06 public image proxy work; keep test IDs and evidence linked from Q-M21..Q-M30 in [quickstart](../quickstart.md).

## UI requirements

- Follow [DESIGN.md](../../../DESIGN.md), the [Frontend Design Gate](../../../docs/09-frontend-design-gate.md), and DG-F14-1..3. Existing tokens, `deriveBrand`, and `BrandScope` remain authoritative; preserve semantic success/warning/error tokens.
- Registration uses the Premium Centered Card. Banner is image-only pending PO confirmation, with one required alt-text locale and fallback; form controls never overlap imagery. No CTA, links, pricing, contact details, or banner text fields. Aspect/height values are open PO design inputs.
- Editor is Split Editor + Live Preview on desktop and tabs on mobile. Preview registration, staff dashboard, and portal placeholder surfaces.
- Show original versus adjusted brand color inline with accessibility explanation. Check contrast on each real surface background/state; `deriveBrand` covers neutral surfaces only. Keep text off banner imagery or use a guaranteed-contrast scrim from existing tokens.
- Per-request scope resolution, late-response discard and neutral no-scope behavior are part of the surface contract.
- Verification evidence required at implementation: AR RTL and EN LTR × light and dark × 390px and 1440px (tablet when layout changes), states, keyboard/focus, screen reader names/roles, touch targets, reduced motion, axe, and `npm run size` within budget. This plan did not perform rendered UI verification.
