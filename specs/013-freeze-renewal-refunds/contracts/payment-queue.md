# Contract: Currency-separated payment queue

S52-PO-3 MCQ-14=A (architect mapping S52-R5) requires unpaid totals to be returned separately for every currency, without adding amounts across currencies. S52-R8 resolves the technical shape as a currency-sorted array of entries containing `currency` and `unpaid_minor`; amounts follow the existing queue convention as decimal strings. Obligation details remain currency-tagged.

S52-F13-MCQ-17 remains open: whether these totals describe only the returned page, the entire workspace queue, or the cursor-and-following pages. Queue aggregate scope and its pagination behavior remain blocked until PO direction; no totals scope is inferred.
