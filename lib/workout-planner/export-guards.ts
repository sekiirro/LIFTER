// F17 export field coverage + formula guard (T007; FR-017, FR-018, SC-008).
//
// EXPORT_FIELDS is the FR-018 field list, including document-level notes.
// Every coach-authored Excel cell is a string; values that could execute as
// a formula (leading `=`, `+`, `-`, `@`, including after leading whitespace
// or control characters) are NOT rewritten. Instead the cell is described as
// text (`type: 'text'`) with `quotePrefix: true` so the future writer stores
// it as text without changing its content (FR-018, SC-008).

// FR-018 §2 required content, in contract order.
export const EXPORT_FIELDS = [
  'planTitle',
  'planIdentity',
  'documentNotes',
  'dayTitles',
  'restDays',
  'exerciseNames',
  'exerciseDescriptions',
  'setOrder',
  'setTypes',
  'reps',
  'load',
  'loadUnits',
  'loadModes',
  'rest',
  'rir',
  'planNotes',
  'dayNotes',
  'exerciseNotes',
  'alternatives',
  'videoLinks',
] as const;

export type ExportField = (typeof EXPORT_FIELDS)[number];

/** True when the name is one of the FR-018 export fields. */
export function isExportField(field: string): field is ExportField {
  return (EXPORT_FIELDS as readonly string[]).includes(field);
}

// The whitespace matcher covers ASCII and Unicode spaces (including
// U+00A0); the explicit ranges keep C0 controls and ZWSP.
const FORMULA_LEAD = /^[\s\u0000-\u0008\u000E-\u0020\u200B]*[=+\-@]/;

export type SafeCell = {
  value: string;
  type: 'text';
  quotePrefix: boolean;
};

/**
 * Describe a value as a spreadsheet cell. The value is never modified: formula-
 * shaped values are flagged (`quotePrefix: true`) so the future writer stores
 * them as text without altering their content.
 */
export function toSafeCell(value: unknown): SafeCell {
  const text = typeof value === 'string' ? value : String(value);
  return { value: text, type: 'text', quotePrefix: FORMULA_LEAD.test(text) };
}
