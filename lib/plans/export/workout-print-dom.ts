/** Normalize server-rendered print markup for stable cross-locale golden tests. */
export function normalizeWorkoutPrintDom(markup: string): string {
  return markup
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
