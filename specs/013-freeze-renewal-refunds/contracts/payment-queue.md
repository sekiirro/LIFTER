# Contract: Currency-separated payment queue

S52-PO-3 MCQ-14=A (architect mapping S52-R5) requires unpaid totals to be returned separately for every currency, without adding amounts across currencies. S52-R8 resolves the technical shape as a currency-sorted array of entries containing `currency` and `unpaid_minor`; amounts follow the existing queue convention as decimal strings. Totals group unpaid installments by each installment's own currency across all workspace queue obligations matching the existing filters, independent of pagination.

S52-PO-7, verbatim `MCQ17B` (source `C:/Users/NEW LAP/.lifter/runs/s52-po/s52-po-7.verbatim.txt`, SHA-256 `5fdd051fa8222b8fc0dd68c4b9b83a34f7d21f4d38b78e1185841ea57cba1944`), resolves S52-F13-MCQ-17 as mapped by architect S52-R20: totals cover every unpaid obligation matching the workspace queue filters, independent of cursor, page, or page size. With unchanged queue data, every page returns the same totals. Values remain separated by installment currency and sorted by currency code.

The detail shape when one subscription contains unpaid installments in multiple currencies is open as S53-F13-MCQ-1 in `spec.md`. Do not infer an item breakdown shape; this does not block the decided aggregate-total contract.
