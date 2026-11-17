# S64 T095 — real T03/N07 rendered matrix evidence

## Scope

Evidence-only closure of T095 (FR-026/036/037). No spec requirement, PO decision,
copy, token, component, layout or motion changed. Existing approved AR (Egyptian
colloquial) and EN strings are rendered as authored; no new strings were added.

## Capture run

- Command: Playwright `tests/e2e/forms-authorized-route.spec.ts -g "approved F15 controls render in both locales"` on Stack A, port 3000 (`PLAYWRIGHT_PORT=3000`), pre-built app reused because the default 60s webServer timeout cannot cover the ~99s Next TypeScript build.
- Result: 1 passed (1.2m). The test signs in a synthetic registered client, creates a fresh approved assignment per state, and walks the intake route.
- Capture directory (OS temp, not committed): `<TEMP>/lifter-s34-f15-r3` (short path `C:\Users\NEWLAP~1\AppData\Local\Temp\lifter-s34-f15-r3`).
- Matrix: `{ar (RTL), en (LTR)} × {light, dark} × {390, 1024, 1440}px × {T03, T08.system, N07.meal-count, N07.timing, N11}` = 60 full-page PNG captures.
- Filenames: `{locale}-{theme}-{width}-{screen}.png`, e.g. `ar-dark-390-N07-timing.png`, `en-light-1440-T03.png`.

## INDEX exactness

The test writes `INDEX.md` in the capture directory from the same `screenshotPaths`
array that produced the PNGs, and asserts `screenshotPaths.length === 60`.

Independent check after the run (`verify-matrix-index.ps1`, recorded in the lane
report):

- `png_count=60`, `index_count=60`
- `missing_in_dir=0`, `missing_in_index=0`
- `INDEX_EXACT=PASS`

Thus `INDEX.md` lists exactly the captures present — no stale or missing entries.

## Axe evidence

Each captured state is checked before capture by
`tests/e2e/forms-authorized-route.spec.ts::expectAxeClean` using
`new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()`
with `expect(violations.violations).toEqual([])`. The run passed, so axe reported
zero violations on all 60 rendered states (and on the shared authorized-route
states covered by the same helper).

## DESIGN.md §12 review (rendered samples)

Reviewed real captures against DESIGN.md §12 criteria:

| Criterion | Verdict | Evidence / note |
|---|---|---|
| Tokens in both themes; workspace color does not alter semantic states | PASS | Dark/light surfaces and primary/secondary actions use existing tokenized colors; no new or hard-coded values introduced by this lane. |
| Contrast, touch targets, keyboard/screen reader, reduced motion | PASS | Axe clean on every state; native controls and visible focus preserved; no motion change. |
| Readable Arabic, mixed-direction content, language switching | PASS | `ar-dark-390-N07-timing.png` shows Western digits `1`/`2` in `الوجبة رقم {number}` with correct RTL placement; `ar-light-1024-N07-meal-count.png` shows `وجبتين / 3 وجبات / 4 وجبات / 5 وجبات` with correct direction. |
| Desktop / tablet / mobile without crowding | PASS | `en-light-1440-T03.png`, `ar-light-1024-N07-meal-count.png`, `en-dark-390-N11.png`: single-question flow, options, navigation and save affordances fit at 390/1024/1440. |
| No draft leakage / no single-plan enforcement / calculator unchanged | PASS | Evidence-only run; no behavior changed. |
| Honest save/submit states | PASS | Captures show the existing "Draft saved." state only after the save action settled; no publish claim added. |
| Role authorization | PASS | Run used a synthetic approved client assignment through the authorized route; no permission change. |
| Tests + evidence in PR | PASS | This report, the passing Playwright run, and the lane report. |
| No out-of-scope example from DESIGN.md implemented | PASS | No spec/plan/task requirement text changed. |

No DESIGN.md §11 gap was encountered; no design-gap escalation, no PO decision needed.

## Result

T095 complete: 60 real captures, exact INDEX, axe clean, DESIGN §12 reviewed with no
findings. No product/UI/copy decision was made.
