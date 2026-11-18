import 'server-only';
import type { Actor } from '../auth/authorize';
import {
  canReadDirectory,
  directoryRpcArgs,
  parseDirectoryResult,
  type DirectoryQuery,
  type DirectoryResult,
} from './query';

type DirectoryRpc = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Both walls: the app check here, then the database check in the RPC. */
export async function loadClientDirectory(
  client: DirectoryRpc,
  actor: Actor,
  workspaceId: string,
  query: DirectoryQuery,
): Promise<DirectoryResult> {
  if (!canReadDirectory(actor, workspaceId)) return { status: 'not_permitted' };
  try {
    const { data, error } = await client.rpc(
      'staff_client_directory',
      directoryRpcArgs(workspaceId, query),
    );
    return parseDirectoryResult(data, error);
  } catch {
    return { status: 'unavailable' };
  }
}
