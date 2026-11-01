import { describe, expect, it } from 'vitest';
import { filterBrandingWorkspaces } from '../../lib/branding/workspaces';

const workspaces = [
  { id: 'workspace-a', name: 'A' },
  { id: 'workspace-b', name: 'B' },
  { id: 'workspace-c', name: 'C' },
];

describe('branding workspace visibility', () => {
  it('shows every authorized workspace to a Platform Owner without memberships', () => {
    expect(
      filterBrandingWorkspaces(workspaces, {
        userId: 'platform-owner',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      }),
    ).toEqual(workspaces);
  });

  it('limits Workspace Owners to active memberships and excludes unauthorized roles', () => {
    expect(
      filterBrandingWorkspaces(workspaces, {
        userId: 'workspace-owner',
        role: 'workspace_owner',
        activeWorkspaceIds: ['workspace-b'],
      }),
    ).toEqual([workspaces[1]]);
    expect(
      filterBrandingWorkspaces(workspaces, {
        userId: 'sales',
        role: 'sales',
        activeWorkspaceIds: ['workspace-a', 'workspace-b', 'workspace-c'],
      }),
    ).toEqual([]);
  });
});
