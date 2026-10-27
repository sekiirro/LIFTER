# Print Spike Findings: Arabic browser print-to-PDF (P0-F2, US5)

**Method**: `/print-sample` (dev-only, AR locale, dark theme) printed with Chromium's print engine (`page.pdf`, A4, `printBackground`) in `tests/e2e/print.spec.ts`. The output `test-results/print-sample.pdf` (2 pages) was inspected visually by the reviewer on 2026-10-27.

| Check | Result | Evidence |
|---|---|---|
| Arabic letter joining (IBM Plex Sans Arabic) | **Pass** | Title and body join correctly, e.g. «نموذج طباعة برنامج التمرين» and «القرفصاء» |
| RTL direction | **Pass** | Title, paragraph and table start at the right edge; the first column (التمرين) is on the right |
| Mixed Arabic / Latin / number runs | **Pass** | «الوزن 82.5 kg — ID LFT-0042» keeps the number–unit and code order via `<bdi>` |
| English paragraph inside an RTL page | **Pass** | Rendered left-to-right |
| Table across pages | **Pass** | 25 rows over 2 pages. The header row repeats on page 2. No row is split. |
| Screen chrome hidden | **Pass** | Language/theme switchers are absent from the PDF |
| Page background | **Fail → fixed** | The first run printed the dark theme background in the page margins. The root/body background is now reset to the print tokens, with an e2e assertion. |
| PDF text layer (copy/search) | **Limitation** | On page 2, the extracted text order of the Arabic table rows is scrambled, although the visual output is correct. This is a known Chromium PDF text-extraction quirk. It matters only if exported PDFs must support copy/search or accessibility tagging. |

**Conclusion**: Browser-side print-to-PDF is viable for Arabic plans at $0, as Architecture v3 assumed.

**Left for the P3 booklet spec** (not built here, DESIGN.md §9 and §11-6):

- Final page size and margins. A4 with 15 mm margins is provisional.
- Cover, workspace branding and page numbering
- Tagged/accessible PDF requirements, if any
- Behavior of long cells
- Font weights used in print
