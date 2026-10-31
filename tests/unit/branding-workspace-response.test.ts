import { describe, expect, it } from 'vitest';
import {
  hasWorkspaceDraftResponse,
  hasWorkspaceDraftEnvelope,
} from '../../lib/branding/workspace-response';

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

  it('accepts a null response as a workspace with no draft', () => {
    expect(hasWorkspaceDraftResponse(null, 'workspace-a')).toBe(true);
    expect(
      hasWorkspaceDraftResponse({ workspaceId: 'workspace-a' }, 'workspace-a'),
    ).toBe(true);
    expect(
      hasWorkspaceDraftResponse({ workspaceId: 'workspace-b' }, 'workspace-a'),
    ).toBe(false);
  });
});
