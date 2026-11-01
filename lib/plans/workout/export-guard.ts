// F17 export formula-injection guard (T009).
// ExcelJS must write every coach-authored cell as a string, never as a formula.

export function isFormulaInjection(value: string): boolean {
  const firstCharacter = value.trimStart().charAt(0);
  if (firstCharacter === '') return false;
  return (
    firstCharacter === '=' ||
    firstCharacter === '+' ||
    firstCharacter === '-' ||
    firstCharacter === '@'
  );
}

export function neutralizeFormulaInjection(value: string): string {
  return `'${value}`;
}

export function toSafeExportCellValue(
  value: string | number | boolean | null | undefined,
): string | number | boolean | null | undefined {
  if (typeof value !== 'string') return value;
  if (!isFormulaInjection(value)) return value;
  return neutralizeFormulaInjection(value);
}
