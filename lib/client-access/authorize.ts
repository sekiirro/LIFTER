import { getClientSelfStatus } from './status';

export type ClientAccessResult =
  | { allowed: true; approvalState: 'approved' }
  | {
      allowed: false;
      status: 'pending-approval' | 'rejected' | 'not_permitted' | 'unavailable';
    };

export async function authorizeClientAccess(): Promise<ClientAccessResult> {
  const status = await getClientSelfStatus();
  if (status.status !== 'ok') return { allowed: false, status: status.status };
  if (status.approval_state === 'approved')
    return { allowed: true, approvalState: 'approved' };
  return { allowed: false, status: status.approval_state };
}
