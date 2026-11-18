import { describe, expect, it } from 'vitest';
import type { Actor } from '../../lib/auth/authorize';
import {
  canDecideLeaderboard,
  canViewWorkspaceLeaderboard,
  isClientSession,
} from '../../lib/leaderboard/authorization';

const actor = (
  role: Actor['role'],
  activeWorkspaceIds: string[] = ['ws-a'],
): Actor => ({ userId: 'user', role, activeWorkspaceIds });

describe('T003 app-layer leaderboard wall (FR-027, FR-028)', () => {
  it('lets only the Platform Owner decide a monthly result', () => {
    expect(canDecideLeaderboard(actor('platform_owner', []))).toBe(true);
    for (const role of ['workspace_owner', 'trainer', 'sales', null] as const)
      expect(canDecideLeaderboard(actor(role))).toBe(false);
    expect(canDecideLeaderboard(null)).toBe(false);
  });

  it('lets staff view only workspaces with an active membership; the PO views any', () => {
    for (const role of ['workspace_owner', 'trainer', 'sales'] as const) {
      expect(canViewWorkspaceLeaderboard(actor(role), 'ws-a')).toBe(true);
      expect(canViewWorkspaceLeaderboard(actor(role), 'ws-b')).toBe(false);
    }
    expect(
      canViewWorkspaceLeaderboard(actor('platform_owner', []), 'ws-b'),
    ).toBe(true);
    expect(canViewWorkspaceLeaderboard(actor(null), 'ws-a')).toBe(false);
    expect(canViewWorkspaceLeaderboard(actor('trainer'), ' ')).toBe(false);
    expect(canViewWorkspaceLeaderboard(null, 'ws-a')).toBe(false);
  });

  it('treats only non-staff sessions as client self-service callers', () => {
    expect(isClientSession(actor(null, []))).toBe(true);
    expect(isClientSession(actor('trainer'))).toBe(false);
    expect(isClientSession(null)).toBe(false);
  });
});
