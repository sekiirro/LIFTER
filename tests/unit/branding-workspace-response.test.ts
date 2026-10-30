import { describe, expect, it } from 'vitest';
import { hasWorkspaceDraftEnvelope } from '../../lib/branding/workspace-response';

describe('workspace branding draft response', () => {
  it('accepts the API draft DTO only for the requested workspace', () => {
    expect(
      hasWorkspaceDraftEnvelope({ workspaceId: 'workspace-a' }, 'workspace-a'),
    ).toBe(true);
    expect(
      hasWorkspaceDraftEnvelope({ workspace_id: 'workspace-a' }, 'workspace-a'),
    ).toBe(false);
    expect(
      hasWorkspaceDraftEnvelope({ workspaceId: 'workspace-b' }, 'workspace-a'),
    ).toBe(false);
  });
});
