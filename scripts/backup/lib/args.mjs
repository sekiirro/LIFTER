export class UsageError extends Error {}
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
