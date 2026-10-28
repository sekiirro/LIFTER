# Contract: Storage CI and UI surfaces

## Required Storage CI lane

- A required CI lane enables Storage and waits for explicit readiness checks before running any Storage test.
- Zero Storage-related skips are permitted. A missing service, missing readiness signal, or skipped security case fails the lane.
- Run F11 pending-client Storage denial scenarios alongside F14 bucket/path policy cases, including direct API attempts. Use isolated fixtures and restore stack state even after failure. Update F11 isolated-runner restoration assumptions as coordinated work.
- Include unit and contract coverage for validation, state reconciliation, revision races, proxy authorization, and browser-facing surface states. DB/Storage integration work runs only on stack B.

## UI requirements

- Follow [DESIGN.md](../../../DESIGN.md), the [Frontend Design Gate](../../../docs/09-frontend-design-gate.md), and DG-F14-1..3. Existing tokens, `deriveBrand`, and `BrandScope` remain authoritative; preserve semantic success/warning/error tokens.
- Registration uses the Premium Centered Card. Banner is image-only pending PO confirmation, with one required alt-text locale and fallback; form controls never overlap imagery. No CTA, links, pricing, contact details, or banner text fields. Aspect/height values are open PO design inputs.
- Editor is Split Editor + Live Preview on desktop and tabs on mobile. Preview registration, staff dashboard, and portal placeholder surfaces.
- Show original versus adjusted brand color inline with accessibility explanation. Check contrast on each real surface background/state; `deriveBrand` covers neutral surfaces only. Keep text off banner imagery or use a guaranteed-contrast scrim from existing tokens.
- Per-request scope resolution, late-response discard and neutral no-scope behavior are part of the surface contract.
- Verification evidence required at implementation: AR RTL and EN LTR × light and dark × 390px and 1440px (tablet when layout changes), states, keyboard/focus, screen reader names/roles, touch targets, reduced motion, axe, and `npm run size` within budget. This plan did not perform rendered UI verification.
