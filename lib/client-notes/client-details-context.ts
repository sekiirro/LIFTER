import { authorize, type Actor } from '../auth/authorize';
import { isUuid } from './validation';

export type AuthorizedClientContext = {
  clientId: string;
  workspaceId: string;
};

export function resolveStaffClientContext(
  actor: Actor | null,
  requestedClientId: string,
  result: unknown,
): AuthorizedClientContext | null {
  if (!isUuid(requestedClientId) || !actor?.role) return null;
  const first = Array.isArray(result) ? result[0] : result;
  if (!first || typeof first !== 'object') return null;
  const row = first as Record<string, unknown>;
  const normalizedClientId = requestedClientId.toLowerCase();
  if (
    typeof row.client_id !== 'string' ||
    row.client_id.toLowerCase() !== normalizedClientId ||
    typeof row.workspace_id !== 'string' ||
    !authorize(actor, 'coaching_work', row.workspace_id)
  )
    return null;
  return { clientId: normalizedClientId, workspaceId: row.workspace_id };
}
