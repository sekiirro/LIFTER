/** A field entry is supplied by the approved, versioned PO export manifest. */
export type ExportField = Readonly<{
  key: string;
  type: 'text' | 'number';
}>;

type CsvValue = string | number | boolean | Date | null | undefined;

function formulaSafe(value: string): string {
  return /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
}

function quote(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function cell(value: CsvValue, field: ExportField): string {
  if (value === null || value === undefined) return '';

  // Only actual numeric values in numeric manifest fields retain a leading
  // minus sign as numeric data. Any string is still treated as text so an
  // unexpected textual value cannot turn into a spreadsheet formula.
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }

  const text = value instanceof Date ? value.toISOString() : String(value);
  return quote(formulaSafe(text));
}

/**
 * Serialize rows in manifest order. Extra source properties are deliberately
 * ignored so an expanded reader cannot silently expand the exported dataset.
 */
export function serializeCsv(
  manifest: readonly ExportField[],
  rows: readonly Readonly<Record<string, CsvValue>>[],
): string {
  if (
    manifest.length === 0 ||
    manifest.some((field) => !field.key || !/^(text|number)$/u.test(field.type)) ||
    new Set(manifest.map((field) => field.key)).size !== manifest.length
  ) {
    throw new Error('Invalid PO export manifest');
  }

  const lines = [manifest.map((field) => quote(field.key)).join(',')];
  for (const row of rows) {
    lines.push(manifest.map((field) => cell(row[field.key], field)).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
