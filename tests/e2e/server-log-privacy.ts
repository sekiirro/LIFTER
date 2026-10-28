export type SensitiveLogValues = Record<
  string,
  string | readonly string[] | undefined
>;

export type SensitiveLogScan = {
  hitCount: number;
  matchedLineCount: number;
  categories: string[];
};

export function scanSensitiveLogLines(
  lines: readonly string[],
  sensitiveValues: SensitiveLogValues,
): SensitiveLogScan {
  const categories = new Set<string>();
  let matchedLineCount = 0;
  for (const line of lines) {
    let matched = false;
    for (const [category, rawValues] of Object.entries(sensitiveValues)) {
      const values = Array.isArray(rawValues) ? rawValues : [rawValues];
      if (
        values.some(
          (value) =>
            typeof value === 'string' &&
            value.length > 0 &&
            line.includes(value),
        )
      ) {
        categories.add(category);
        matched = true;
      }
    }
    if (matched) matchedLineCount += 1;
  }
  return {
    hitCount: categories.size,
    matchedLineCount,
    categories: [...categories].sort(),
  };
}
