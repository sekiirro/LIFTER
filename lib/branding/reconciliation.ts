import {
  transitionBrandingUpload,
  type BrandingUpload,
  type BrandingUploadStatus,
} from './upload-state';

export type BrandingUploadStorage = {
  inspect(upload: BrandingUpload): Promise<{ present: boolean }>;
  retryStage(
    upload: BrandingUpload,
  ): Promise<{ completed: boolean; status?: BrandingUploadStatus }>;
};

export async function reconcileBrandingUpload(
  upload: BrandingUpload,
  dependencies: { storage: BrandingUploadStorage },
): Promise<BrandingUpload> {
  if (upload.status === 'reconciliation_pending') {
    try {
      const inspection = await dependencies.storage.inspect(upload);
      if (!inspection.present) {
        const retry = await dependencies.storage.retryStage(upload);
        if (!retry.completed) return upload;
        return transitionBrandingUpload(upload, {
          type: 'reconciliation_complete',
          status: retry.status === 'cleaned' ? 'cleaned' : 'staging',
        });
      }
      const retry = await dependencies.storage.retryStage(upload);
      if (!retry.completed) return upload;
      return transitionBrandingUpload(upload, {
        type: 'reconciliation_complete',
        status: retry.status === 'cleaned' ? 'cleaned' : 'staging',
      });
    } catch {
      return upload;
    }
  }
  if (upload.status === 'interrupted') {
    try {
      const inspection = await dependencies.storage.inspect(upload);
      if (!inspection.present) {
        const retry = await dependencies.storage.retryStage(upload);
        if (!retry.completed)
          return transitionBrandingUpload(upload, {
            type: 'reconciliation_pending',
          });
        return transitionBrandingUpload(upload, {
          type: 'reconciliation_complete',
          status: retry.status === 'cleaned' ? 'cleaned' : 'staging',
        });
      }
      const retry = await dependencies.storage.retryStage(upload);
      if (!retry.completed)
        return transitionBrandingUpload(upload, {
          type: 'reconciliation_pending',
        });
      return transitionBrandingUpload(upload, {
        type: 'reconciliation_complete',
        status: retry.status === 'cleaned' ? 'cleaned' : 'staging',
      });
    } catch {
      return transitionBrandingUpload(upload, {
        type: 'reconciliation_pending',
      });
    }
  }
  return upload;
}
