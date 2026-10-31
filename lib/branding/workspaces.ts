import { authorize, type Actor } from '../auth/authorize';

export function filterBrandingWorkspaces<T extends { id: string }>(
  workspaces: readonly T[],
  actor: Actor,
): T[] {
  return workspaces.filter((workspace) =>
    authorize(actor, 'manage_branding', workspace.id),
  );
}
