import { getStackConfig, selectStack } from '../../scripts/local-stack.mjs';

type LocalService = 'auth' | 'db' | 'kong';

export function localSupabaseContainer(service: LocalService) {
  const { projectId } = getStackConfig(selectStack());
  return `supabase_${service}_${projectId}`;
}
