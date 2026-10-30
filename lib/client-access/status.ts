import 'server-only';
import { cache } from 'react';
import { createSessionClient } from '../supabase/server';

export type ClientApprovalState = 'pending-approval' | 'approved' | 'rejected';
export type ClientSelfStatus =
  | { status: 'ok'; approval_state: ClientApprovalState }
  | { status: 'not_permitted' | 'unavailable' };

export function createClientStatusReader(
  load: () => Promise<ClientSelfStatus>,
): () => Promise<ClientSelfStatus> {
  let result: Promise<ClientSelfStatus> | undefined;
  return () => (result ??= load());
}

async function loadSignedClientSelfStatus(): Promise<ClientSelfStatus> {
  try {
    const client = await createSessionClient();
    if (!client) return { status: 'unavailable' };
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return { status: 'not_permitted' };
    const { data: result, error: rpcError } =
      await client.rpc('client_self_status');
    if (
      rpcError ||
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result)
    )
      return { status: 'unavailable' };
    const status = (result as { status?: unknown }).status;
    if (status === 'not_permitted') return { status };
    const approvalState = (result as { approval_state?: unknown })
      .approval_state;
    if (
      status !== 'ok' ||
      !['pending-approval', 'approved', 'rejected'].includes(
        String(approvalState),
      )
    )
      return { status: 'unavailable' };
    return {
      status: 'ok',
      approval_state: approvalState as ClientApprovalState,
    };
  } catch {
    return { status: 'unavailable' };
  }
}

// React cache is scoped to the active server request; no module-owned result is retained.
const readForCurrentRequest = cache(loadSignedClientSelfStatus);

export function getClientSelfStatus(): Promise<ClientSelfStatus> {
  return readForCurrentRequest();
}
