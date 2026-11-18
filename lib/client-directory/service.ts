import 'server-only';
import type { Actor } from '../auth/authorize';
import {
  canReadDirectory,
  canUseAssignment,
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
  // F11 wall: assignment is for the Workspace/Platform Owner only; for anyone
  // else the filter is not sent and any assignment state is dropped.
  const assignmentAllowed = canUseAssignment(actor, workspaceId);
  try {
    const { data, error } = await client.rpc(
      'staff_client_directory',
      directoryRpcArgs(workspaceId, query, assignmentAllowed),
    );
    const result = parseDirectoryResult(data, error);
    if (result.status !== 'ok' || assignmentAllowed) return result;
    return {
      ...result,
      rows: result.rows.map((row) => {
        const visible = { ...row };
        delete visible.assignment;
        return visible;
      }),
    };
  } catch {
    return { status: 'unavailable' };
  }
}
