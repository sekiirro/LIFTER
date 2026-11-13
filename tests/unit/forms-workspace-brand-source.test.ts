import { describe, expect, it, vi } from 'vitest';
import { createFormsWorkspaceBrandSource } from '../../lib/forms/workspace-brand-source';

describe('F15 published workspace brand source', () => {
  it('reads only the current F14 publication color for the requested workspace', async () => {
    const getCurrentPublication = vi.fn(async (workspaceId: string) => ({
      workspaceId,
      sequence: 4,
      fields: { names: { ar: '', en: '' }, color: '#059669' as const },
    }));
    const source = createFormsWorkspaceBrandSource({ getCurrentPublication });

    await expect(source.resolvePublishedColor('workspace-1')).resolves.toBe(
      '#059669',
    );
    expect(getCurrentPublication).toHaveBeenCalledExactlyOnceWith(
      'workspace-1',
    );
  });

  it('uses the neutral fallback for missing, blank, or unavailable publications', async () => {
    const getCurrentPublication = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('private repository details'));
    const source = createFormsWorkspaceBrandSource({ getCurrentPublication });

    await expect(source.resolvePublishedColor('workspace-1')).resolves.toBe(
      null,
    );
    await expect(source.resolvePublishedColor('workspace-2')).resolves.toBe(
      null,
    );
    await expect(source.resolvePublishedColor('  ')).resolves.toBe(null);
    expect(getCurrentPublication).toHaveBeenCalledTimes(2);
  });
});
