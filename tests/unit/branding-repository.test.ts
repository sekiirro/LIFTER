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
  it('returns null for an upload-created draft with no persisted names', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: {
        workspace_id: 'workspace-a',
        revision: 1,
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
