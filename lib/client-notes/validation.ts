const clientNoteWhitespace =
  /[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u;
const leadingTrailingWhitespace =
  /^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu;

export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function normalizeClientNoteBody(value: unknown): string | null {
  if (typeof value !== 'string' || value.includes('\u0000')) return null;
  const body = value.replace(leadingTrailingWhitespace, '');
  const length = Array.from(body).length;
  return length >= 1 && length <= 5000 ? body : null;
}

export function isClientNoteWhitespace(value: string): boolean {
  return clientNoteWhitespace.test(value);
}
