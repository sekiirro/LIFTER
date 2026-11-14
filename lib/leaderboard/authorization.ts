import type { Actor } from '../auth/authorize';

/**
 * App-layer wall for F24 (FR-001, FR-027, FR-028, FR-035). The database
 * repeats every check inside the SECURITY DEFINER RPCs; neither wall trusts
 * the other. A caller-supplied workspace id is never authority by itself.
 */
export function isPlatformOwner(actor: Actor | null): boolean {
  return actor?.role === 'platform_owner';
}

/** FR-028: only the Platform Owner records the monthly approve/reject decision. */
export function canDecideLeaderboard(actor: Actor | null): boolean {
  return isPlatformOwner(actor);
}

/**
 * FR-027 staff viewers: the Platform Owner, or any staff role (workspace
 * owner, trainer, sales) with an active membership in that workspace.
 */
export function canViewWorkspaceLeaderboard(
  actor: Actor | null,
  workspaceId: string,
): boolean {
  if (!actor || actor.role === null || workspaceId.trim().length === 0)
    return false;
  return (
    actor.role === 'platform_owner' ||
    actor.activeWorkspaceIds.includes(workspaceId)
  );
}

/**
 * Client self-service (opt-out, username edit) resolves the client from the
 * session in the database; staff sessions never act as a client.
 */
export function isClientSession(actor: Actor | null): boolean {
  return actor !== null && actor.role === null;
}
