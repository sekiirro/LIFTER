import type { BrandingRepository } from '../branding/service';
import type { FormsWorkspaceBrandSource } from './staff-contracts';

type PublishedBrandingReader = Pick<BrandingRepository, 'getCurrentPublication'>;

/** Adapts F14's current-publication contract to the F15 staff presentation seam. */
export function createFormsWorkspaceBrandSource(
  repository: PublishedBrandingReader,
): FormsWorkspaceBrandSource {
  return {
    async resolvePublishedColor(workspaceId) {
      if (!workspaceId.trim()) return null;
      try {
        const publication = await repository.getCurrentPublication(workspaceId);
        return publication?.fields.color ?? null;
      } catch {
        return null;
      }
    },
  };
}
