export type BuilderNumberKind = 'reps' | 'rest' | 'rir' | 'load';

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩۰-۹]/g, (digit) => {
      const code = digit.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replace(/٫/g, '.');
}

function canonicalDecimal(value: string): string | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const whole = match[1]!.replace(/^0+(?=\d)/, '');
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function parseBuilderNumber(
  value: string,
  kind: 'load',
): string | null | undefined;
export function parseBuilderNumber(
  value: string,
  kind: 'reps' | 'rest' | 'rir',
): number | null | undefined;
export function parseBuilderNumber(
  value: string,
  kind: BuilderNumberKind,
): number | string | null | undefined;
export function parseBuilderNumber(
  value: string,
  kind: BuilderNumberKind,
): number | string | null | undefined {
  const normalized = normalizeDigits(value);
  if (normalized === '')
    return kind === 'rest' || kind === 'rir' ? undefined : null;

  if (kind === 'reps') {
    if (!/^\d+$/.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }

  if (kind === 'load') {
    const canonical = canonicalDecimal(normalized);
    if (canonical === null || !/[1-9]/.test(canonical)) return null;
    return canonical;
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  if (kind === 'rest' && number < 0) return null;
  if (kind === 'rir' && number < 0) return null;
  return number;
}
