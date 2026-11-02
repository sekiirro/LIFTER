import { describe, expect, it, vi } from 'vitest';
import type { PublishedWorkoutVersionApiResponse } from '../../lib/plans/export/excel';
import { selectPublishedWorkoutVersion } from '../../lib/plans/export/workout-print-data';
import type { PublishedWorkoutVersionLoader } from '../../lib/plans/export/workout-print-data';
import type { Actor } from '../../lib/auth/authorize';

const actor: Actor = {
  userId: 'trainer-1',
  role: 'trainer',
  activeWorkspaceIds: ['workspace-1'],
};
const requested = { planId: 'plan-en-001', version: 2 };
const versionN = {
  status: 'published',
  ...requested,
  sourceRevision: 5,
  schemaVersion: 1,
  document: { days: [], notes: 'Version N' },
} as unknown as PublishedWorkoutVersionApiResponse;

describe('selected published workout print data', () => {
  it('asks the loader for the requested immutable version, not the latest', async () => {
    const versionNPlusOne = {
      ...versionN,
      version: 3,
      document: { days: [], notes: 'Version N+1' },
    };
    const immutableVersions = [versionN, versionNPlusOne];
    const loadPublishedVersion = vi.fn(
      async (_actor: Actor, identifier: typeof requested) =>
        immutableVersions.find(
          (candidate) =>
            candidate.planId === identifier.planId &&
            candidate.version === identifier.version,
        ) ?? null,
    );
    const loader: PublishedWorkoutVersionLoader = { loadPublishedVersion };
    const selected = await selectPublishedWorkoutVersion(
      loader,
      actor,
      requested,
    );
    expect(loadPublishedVersion).toHaveBeenCalledWith(actor, requested);
    expect(selected).toEqual(versionN);
    expect(selected?.document.notes).toBe('Version N');
  });

  it('rejects drafts and responses for a different selected version', async () => {
    const loader: PublishedWorkoutVersionLoader = {
      loadPublishedVersion: async () =>
        ({
          ...versionN,
          status: 'draft',
        }) as unknown as PublishedWorkoutVersionApiResponse,
    };
    await expect(
      selectPublishedWorkoutVersion(loader, actor, requested),
    ).resolves.toBeNull();

    const mismatch: PublishedWorkoutVersionLoader = {
      loadPublishedVersion: async () => ({ ...versionN, version: 3 }),
    };
    await expect(
      selectPublishedWorkoutVersion(mismatch, actor, requested),
    ).resolves.toBeNull();
  });
});
