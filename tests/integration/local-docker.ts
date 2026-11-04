import { getStackConfig, selectStack } from '../../scripts/local-stack.mjs';

type LocalService = 'auth' | 'db' | 'kong';

export function localSupabaseContainer(
  service: LocalService,
  root = process.cwd(),
) {
  const { projectId } = getStackConfig(selectStack(), root);
  return `supabase_${service}_${projectId}`;
}
