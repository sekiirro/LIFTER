import type { BrandingUploadRole } from './upload-state';

export function brandingValidatedObjectName(
  workspaceId: string,
  role: BrandingUploadRole,
  contentHash: string,
  uploadId: string,
  contentType: 'image/png' | 'image/webp',
): string {
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  if (
    !uuid.test(workspaceId) ||
    !uuid.test(uploadId) ||
    !/^[0-9a-f]{64}$/.test(contentHash)
  ) {
    throw new Error('invalid_branding_object_identity');
  }
  const extension = contentType === 'image/png' ? 'png' : 'webp';
  return `${workspaceId}/validated/${role}/${contentHash}-${uploadId}.${extension}`;
}
