export function isShowcaseEnabled(
  env: Record<string, string | undefined>,
): boolean {
  return env.LIFTER_SHOWCASE === '1';
}
