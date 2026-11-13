'use server';

import { getClientSelfStatus } from '../../../../lib/client-access/status';
import { approvedAssignmentDestination } from '../../../../lib/client-access/routes';
import { createSessionClient } from '../../../../lib/supabase/server';

export async function refreshClientStatus() {
  return getClientSelfStatus();
}

export async function preflightClientHomeNavigation() {
  const status = await getClientSelfStatus();
  if (status.status === 'ok' && status.approval_state === 'approved') {
    try {
      const client = await createSessionClient();
      if (!client) return { status: 'ok' as const, destination: '/' as const };
      const { data, error } = await client.rpc(
        'read_client_intake_destination',
      );
      if (
        error ||
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        (data as { status?: unknown }).status !== 'ok'
      )
        return { status: 'ok' as const, destination: '/' as const };
      const assignmentId = (data as { assignment_id?: unknown }).assignment_id;
      return {
        status: 'ok' as const,
        destination: approvedAssignmentDestination(assignmentId) ?? '/',
      };
    } catch {
      return { status: 'ok' as const, destination: '/' as const };
    }
  }
  return status;
}
