import { describe, expect, it } from 'vitest';
import { resolveStaffClientContext } from '../../lib/client-notes/client-details-context';
import type { Actor } from '../../lib/auth/authorize';

const clientId = 'd29e1c04-2ddb-49fd-9a51-161cf35bca89';
const workspaceA = 'a49e1c04-2ddb-49fd-9a51-161cf35bca89';
const workspaceB = 'b49e1c04-2ddb-49fd-9a51-161cf35bca89';
const authorizedContext = [{ client_id: clientId, workspace_id: workspaceA }];

function actor(
  role: Actor['role'],
  activeWorkspaceIds: readonly string[],
): Actor {
  return { userId: `user-${role ?? 'client'}`, role, activeWorkspaceIds };
}

describe('Client Details route authorization context', () => {
  it.each([
    ['Workspace Owner', actor('workspace_owner', [workspaceA])],
    ['Trainer', actor('trainer', [workspaceA])],
    ['Platform Owner', actor('platform_owner', [])],
  ])('allows an authorized %s', (_label, currentActor) => {
    expect(
      resolveStaffClientContext(currentActor, clientId, authorizedContext),
    ).toEqual({ clientId, workspaceId: workspaceA });
  });

  it.each([
    ['Sales', actor('sales', [workspaceA])],
    ['Client', actor(null, [workspaceA])],
    ['foreign workspace staff', actor('trainer', [workspaceB])],
    ['revoked staff', actor('trainer', [])],
  ])('denies %s', (_label, currentActor) => {
    expect(
      resolveStaffClientContext(currentActor, clientId, authorizedContext),
    ).toBeNull();
  });

  it('treats anonymous, unknown, and unauthorized requests identically', () => {
    const deniedContext = resolveStaffClientContext(
      actor('trainer', [workspaceB]),
      clientId,
      authorizedContext,
    );
    expect(resolveStaffClientContext(null, clientId, [])).toBe(deniedContext);
    expect(
      resolveStaffClientContext(actor('trainer', [workspaceA]), clientId, []),
    ).toBe(deniedContext);
    expect(
      resolveStaffClientContext(
        actor('trainer', [workspaceA]),
        'not-a-uuid',
        [],
      ),
    ).toBe(deniedContext);
  });
});
