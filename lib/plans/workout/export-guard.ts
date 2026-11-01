// F17 export formula-injection guard (T009).
// ExcelJS must write every coach-authored cell as a string, never as a formula.

const FORMULA_PREFIX_CHARACTERS = ['=', '+', '-', '@'];

export function isFormulaInjection(value: string): boolean {
  const rawFirstCharacter = value.charAt(0);
  const firstCharacter = value.trimStart().charAt(0);
  const startsWithFormulaCharacter =
    firstCharacter !== '' && FORMULA_PREFIX_CHARACTERS.includes(firstCharacter);
  const rawStartsWithFormulaCharacter =
    rawFirstCharacter !== '' &&
    FORMULA_PREFIX_CHARACTERS.includes(rawFirstCharacter);
  if (firstCharacter === '') return false;
  return startsWithFormulaCharacter || rawStartsWithFormulaCharacter;
}

export function toCoachTextCell(value: string): {
  type: 'string';
  value: string;
} {
  return { type: 'string', value };
}
