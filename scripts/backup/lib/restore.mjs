import { rm } from 'node:fs/promises';
import { supabase } from './exec.mjs';

export const RESTORE_EXCLUSIONS =
  'studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta';

export async function teardownRestoreStack(
  workdir,
  keepStack,
  { stop = supabase, remove = rm } = {},
) {
  if (keepStack) return;
  await stop(['stop', '--no-backup', '--workdir', workdir]);
  // Keep the config available for a retry if stopping Docker fails.
  await remove(workdir, { recursive: true, force: true });
}
