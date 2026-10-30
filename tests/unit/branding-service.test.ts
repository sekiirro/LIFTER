import { describe, expect, it, vi } from 'vitest';
import {
  createBrandingService,
  type BrandingRepository,
  type BrandingVersion,
} from '../../lib/branding/service';
import type { NormalizedBrandingDraft } from '../../lib/branding/validation';

const actor = { id: 'actor-1', role: 'workspace_owner' as const };
const fields: NormalizedBrandingDraft = {
  names: { ar: 'النخبة', en: 'Elite' },
  color: '#059669',
};

function setup() {
  const draft = {
    workspaceId: 'workspace-a',
    revision: 3,
    fields,
  };
  const repository: BrandingRepository = {
    getDraft: vi.fn().mockResolvedValue(draft),
    compareAndSetDraft: vi.fn().mockResolvedValue({
      ...draft,
      revision: 4,
      fields,
    }),
    getCurrentPublication: vi.fn().mockResolvedValue(null),
    publishDraftCAS: vi.fn(),
  };
  const authorize = vi.fn().mockReturnValue(true);
  return {
    repository,
    authorize,
    service: createBrandingService({ repository, authorize }),
  };
}

describe('branding service pure repository contract', () => {
  it('authorizes explicit workspace scope before reading or mutating draft state', async () => {
    const { service, repository, authorize } = setup();
    await service.saveDraft({
      actor,
      workspaceId: 'workspace-a',
      expectedRevision: 3,
      fields,
    });

    expect(authorize).toHaveBeenCalledWith(actor, 'workspace-a');
    expect(repository.getDraft).toHaveBeenCalledWith('workspace-a');
    expect(repository.compareAndSetDraft).toHaveBeenCalledWith(
      'workspace-a',
      3,
      expect.objectContaining({ color: '#059669' }),
    );
  });

  it('denies a foreign or missing scope before repository access', async () => {
    const { service, repository, authorize } = setup();
    authorize.mockReturnValue(false);

    await expect(
      service.saveDraft({
        actor,
        workspaceId: 'workspace-foreign',
        expectedRevision: 3,
        fields,
      }),
    ).rejects.toThrow(/denied/i);
    await expect(
      service.saveDraft({
        actor,
        workspaceId: '',
        expectedRevision: 3,
        fields,
      }),
    ).rejects.toThrow(/scope/i);
    expect(repository.getDraft).not.toHaveBeenCalled();
  });

  it.each(['sales', 'trainer'] as const)(
    'never reaches the repository for a %s actor denied by the injected policy',
    async (role) => {
      const { service, repository, authorize } = setup();
      authorize.mockImplementation(
        (candidate) =>
          candidate.role === 'platform_owner' ||
          candidate.role === 'workspace_owner',
      );

      await expect(
        service.saveDraft({
          actor: { id: 'actor-denied', role },
          workspaceId: 'workspace-a',
          expectedRevision: 3,
          fields,
        }),
      ).rejects.toMatchObject({ code: 'denied' });
      expect(repository.getDraft).not.toHaveBeenCalled();
    },
  );

  it('passes platform-wide and own-workspace scope decisions through the injected policy', async () => {
    const { service, repository, authorize } = setup();
    authorize.mockImplementation(
      (candidate, workspaceId) =>
        candidate.role === 'platform_owner' ||
        (candidate.role === 'workspace_owner' && workspaceId === 'workspace-a'),
    );

    await expect(
      service.saveDraft({
        actor: { id: 'po-1', role: 'platform_owner' },
        workspaceId: 'workspace-foreign',
        expectedRevision: 3,
        fields,
      }),
    ).resolves.toBeDefined();
    await expect(
      service.saveDraft({
        actor,
        workspaceId: 'workspace-a',
        expectedRevision: 3,
        fields,
      }),
    ).resolves.toBeDefined();
    expect(repository.getDraft).toHaveBeenCalledTimes(2);
  });

  it('uses revision compare-and-set and reports a stale draft without retrying', async () => {
    const { service, repository } = setup();
    vi.mocked(repository.getDraft).mockResolvedValue({
      workspaceId: 'workspace-a',
      revision: 5,
      fields,
    });

    await expect(
      service.saveDraft({
        actor,
        workspaceId: 'workspace-a',
        expectedRevision: 4,
        fields,
      }),
    ).rejects.toMatchObject({ code: 'stale_revision' });
    expect(repository.compareAndSetDraft).not.toHaveBeenCalled();
  });

  it('returns a stale result when repository CAS loses a concurrent save race', async () => {
    const { service, repository } = setup();
    vi.mocked(repository.compareAndSetDraft).mockResolvedValue(null);

    await expect(
      service.saveDraft({
        actor,
        workspaceId: 'workspace-a',
        expectedRevision: 3,
        fields,
      }),
    ).rejects.toMatchObject({ code: 'stale_revision' });
  });

  it('delegates unique sequencing and current-only replacement to atomic repository publication', async () => {
    const { service, repository } = setup();
    const published: BrandingVersion = {
      workspaceId: 'workspace-a',
      sequence: 12,
      fields,
    };
    vi.mocked(repository.publishDraftCAS).mockResolvedValue({
      status: 'published',
      current: published,
    });

    await expect(
      service.publishDraft({
        actor,
        workspaceId: 'workspace-a',
        expectedRevision: 3,
      }),
    ).resolves.toEqual({ status: 'published', version: published });
    expect(repository.publishDraftCAS).toHaveBeenCalledWith(
      'workspace-a',
      3,
      fields,
    );
  });

  it('returns unchanged for the current snapshot and exposes no restore API', async () => {
    const { service, repository } = setup();
    const current: BrandingVersion = {
      workspaceId: 'workspace-a',
      sequence: 11,
      fields,
    };
    vi.mocked(repository.getCurrentPublication).mockResolvedValue(current);

    await expect(
      service.publishDraft({
        actor,
        workspaceId: 'workspace-a',
        expectedRevision: 3,
      }),
    ).resolves.toEqual({ status: 'unchanged', version: current });
    expect(repository.publishDraftCAS).not.toHaveBeenCalled();
    expect(service).not.toHaveProperty('restore');
    expect(service).not.toHaveProperty('rollback');
    expect(Object.keys(service).sort()).toEqual(['publishDraft', 'saveDraft']);
  });

  it('preserves an atomic repository no-op when a concurrent publish made the draft current', async () => {
    const { service, repository } = setup();
    const current: BrandingVersion = {
      workspaceId: 'workspace-a',
      sequence: 12,
      fields,
    };
    vi.mocked(repository.publishDraftCAS).mockResolvedValue({
      status: 'unchanged',
      current,
    });

    await expect(
      service.publishDraft({
        actor,
        workspaceId: 'workspace-a',
        expectedRevision: 3,
      }),
    ).resolves.toEqual({ status: 'unchanged', version: current });
  });

  it('rejects publish when the submitted revision is stale', async () => {
    const { service, repository } = setup();
    vi.mocked(repository.getDraft).mockResolvedValue({
      workspaceId: 'workspace-a',
      revision: 5,
      fields,
    });

    await expect(
      service.publishDraft({
        actor,
        workspaceId: 'workspace-a',
        expectedRevision: 4,
      }),
    ).rejects.toMatchObject({ code: 'stale_revision' });
    expect(repository.publishDraftCAS).not.toHaveBeenCalled();
  });

  it('uses independent workspace keys when the repository allocates version sequences', async () => {
    const { service, repository } = setup();
    const nextByWorkspace = new Map<string, number>();
    const currentByWorkspace = new Map<string, BrandingVersion>();
    let workspaceAReads = 0;
    vi.mocked(repository.publishDraftCAS).mockImplementation(
      async (workspaceId, _revision, normalizedFields) => {
        const sequence = (nextByWorkspace.get(workspaceId) ?? 0) + 1;
        nextByWorkspace.set(workspaceId, sequence);
        const current = { workspaceId, sequence, fields: normalizedFields };
        currentByWorkspace.set(workspaceId, current);
        return {
          status: 'published',
          current,
        };
      },
    );
    vi.mocked(repository.getDraft).mockImplementation(async (workspaceId) => {
      const draftFields =
        workspaceId === 'workspace-a' && workspaceAReads++ > 0
          ? { ...fields, color: '#ABCDEF' as const }
          : fields;
      return { workspaceId, revision: 3, fields: draftFields };
    });
    vi.mocked(repository.getCurrentPublication).mockImplementation(
      async (workspaceId) => currentByWorkspace.get(workspaceId) ?? null,
    );

    const first = await service.publishDraft({
      actor,
      workspaceId: 'workspace-a',
      expectedRevision: 3,
    });
    const second = await service.publishDraft({
      actor,
      workspaceId: 'workspace-b',
      expectedRevision: 3,
    });
    const third = await service.publishDraft({
      actor,
      workspaceId: 'workspace-a',
      expectedRevision: 3,
    });

    expect(first).toMatchObject({ version: { sequence: 1 } });
    expect(second).toMatchObject({ version: { sequence: 1 } });
    expect(third).toMatchObject({ version: { sequence: 2 } });
    expect(Object.keys(third).sort()).toEqual(['status', 'version']);
    expect(currentByWorkspace.size).toBe(2);
    expect(currentByWorkspace.get('workspace-a')).toEqual(third.version);
    expect(repository).not.toHaveProperty('getPublicationHistory');
  });
});
