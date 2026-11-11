// F17 export field coverage + formula guard (T007; FR-017, FR-018, SC-008).
//
// EXPORT_FIELDS is the FR-018 field list, including document-level notes.
// Every coach-authored Excel cell is a string; values that could execute as
// a formula (leading `=`, `+`, `-`, `@`, including after leading whitespace
// or control characters) are neutralised with a leading apostrophe text
// marker so spreadsheets store them as text.

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

export function isExportField(field: string): field is ExportField {
  return (EXPORT_FIELDS as readonly string[]).includes(field);
}

const FORMULA_LEAD = /^[ \t\r\n\v\f\u0000-\u0020\u200B\uFEFF]*[=+\-@]/;

/**
 * Return the value as a spreadsheet-safe string cell. Ordinary values pass
 * through unchanged; formula-shaped values get a leading `'` text marker.
 */
export function toSafeCell(value: unknown): string {
  const text = typeof value === 'string' ? value : String(value);
  if (FORMULA_LEAD.test(text)) return `'${text}`;
  return text;
}
