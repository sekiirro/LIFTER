import { roleHasCapability, type Role } from './capabilities';

export type Actor = {
  userId: string;
  role: Role | null;
  activeWorkspaceIds: readonly string[];
};

export function authorize(
  actor: Actor,
  capability: string,
  workspaceId: string,
): boolean {
  return (
    workspaceId.trim().length > 0 &&
    actor.role !== null &&
    (actor.role === 'platform_owner' ||
      actor.activeWorkspaceIds.includes(workspaceId)) &&
    roleHasCapability(actor.role, capability)
  );
}
