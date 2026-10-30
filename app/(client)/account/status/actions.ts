'use server';

import { getClientSelfStatus } from '../../../../lib/client-access/status';

export async function refreshClientStatus() {
  return getClientSelfStatus();
}

export async function preflightClientHomeNavigation() {
  const status = await getClientSelfStatus();
  if (status.status === 'ok' && status.approval_state === 'approved')
    return { status: 'ok' as const, destination: '/' as const };
  return status;
}
