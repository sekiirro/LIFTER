import { assertLocalStackTarget } from '../../scripts/local-stack.mjs';

export function isDisposableStackC(
  env: Record<string, string | undefined>,
  root = process.cwd(),
) {
  if (env.LIFTER_SUPABASE_STACK !== 'c') return false;
  const apiUrl = env.API_URL || env.SUPABASE_URL;
  const dbUrl = env.DB_URL || env.SUPABASE_DB_URL;
  if (!apiUrl || !dbUrl) return false;
  try {
    const config = assertLocalStackTarget({
      stack: 'c',
      apiUrl,
      dbUrl,
      root,
    });
    return config.projectId === 'lifter-stack-c';
  } catch {
    return false;
  }
}
