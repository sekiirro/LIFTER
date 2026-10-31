import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBrandingRepository } from '../../lib/branding/repository';

const fields = {
  name: { ar: 'النخبة', en: 'Elite' },
  bannerAlt: { ar: '', en: '' },
  color: '#059669',
};

function readResult(sequence: number) {
  return {
    workspace_id: 'workspace-a',
    revision: 3,
    fields,
    current_publication: { sequence, fields },
  };
}

describe('Supabase branding repository publication result', () => {
  it('returns null when no draft revision has been created', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: {
        workspace_id: 'workspace-a',
        revision: 0,
        fields: {
          name: { ar: '', en: '' },
          bannerAlt: { ar: '', en: '' },
          color: '#059669',
        },
        current_publication: null,
      },
      error: null,
    });
    const repository = createSupabaseBrandingRepository({
      rpc,
    } as unknown as SupabaseClient);

    await expect(repository.getDraft('workspace-a')).resolves.toBeNull();
  });

  it('preserves the revision of an upload-created draft with empty names for its first save', async () => {
    const emptyRead = {
      workspace_id: 'workspace-a',
      revision: 4,
      fields: {
        name: { ar: '', en: '' },
        bannerAlt: { ar: '', en: '' },
        color: '#059669',
      },
      current_publication: null,
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: emptyRead, error: null })
      .mockResolvedValueOnce({ data: 5, error: null })
      .mockResolvedValueOnce({
        data: {
          ...emptyRead,
          revision: 5,
          fields: {
            ...emptyRead.fields,
            name: { ar: 'النخبة', en: 'Elite' },
          },
        },
        error: null,
      });
    const repository = createSupabaseBrandingRepository({
      rpc,
    } as unknown as SupabaseClient);

    const draft = await repository.getDraft('workspace-a');
    expect(draft?.revision).toBe(4);
    await repository.compareAndSetDraft('workspace-a', draft!.revision, {
      names: { ar: 'النخبة', en: 'Elite' },
      bannerAltText: { ar: '', en: '' },
      color: '#059669',
    });
    expect(rpc.mock.calls[1]).toEqual([
      'branding_draft_save',
      expect.objectContaining({ expected_revision: 4 }),
    ]);
  });

  it('reports an asset-only publication as changed when SQL advances the version sequence', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: readResult(11), error: null })
      .mockResolvedValueOnce({ data: 'published-version-12', error: null })
      .mockResolvedValueOnce({ data: readResult(12), error: null });
    const repository = createSupabaseBrandingRepository({
      rpc,
    } as unknown as SupabaseClient);

    await expect(
      repository.publishDraftCAS('workspace-a', 3, {
        names: { ar: 'النخبة', en: 'Elite' },
        bannerAltText: { ar: '', en: '' },
        color: '#059669',
      }),
    ).resolves.toEqual({
      status: 'published',
      current: {
        workspaceId: 'workspace-a',
        sequence: 12,
        fields: {
          names: { ar: 'النخبة', en: 'Elite' },
          color: '#059669',
        },
      },
    });
  });
});
