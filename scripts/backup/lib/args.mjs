export class UsageError extends Error {}
export function timeoutOptions(minutes) {
  if (minutes === undefined) return {};
  const timeoutMs = Number(minutes) * 60000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647)
    throw new UsageError('Invalid timeout minutes');
  return { timeoutMs };
}
export function parseArgs(argv, values, booleans = []) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i]?.replace(/^--/, '');
    if (!argv[i]?.startsWith('--') || Object.hasOwn(result, name))
      throw new UsageError('Invalid arguments');
    if (booleans.includes(name)) result[name] = true;
    else if (
      values.includes(name) &&
      argv[i + 1] &&
      !argv[i + 1].startsWith('--')
    )
      result[name] = argv[++i];
    else throw new UsageError('Invalid arguments');
  }
  return result;
}
export function requireArgs(args, names) {
  if (names.some((name) => !args[name]))
    throw new UsageError('Missing required arguments');
}
