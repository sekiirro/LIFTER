import { BRANDING_IMAGE_LIMITS, type BrandingImageRole } from './image-limits';

export type BrandingClientFileErrorCode = 'invalid_type' | 'too_large';

type UploadFile = Pick<File, 'size' | 'type'>;

const ALLOWED_MEDIA_TYPES = new Set(['image/png', 'image/webp']);

/**
 * Browser-side guardrail only. The upload action still validates the bytes,
 * dimensions, and processing limits on the server.
 */
export function validateBrandingUploadFile(
  file: UploadFile,
  role: BrandingImageRole,
): BrandingClientFileErrorCode | null {
  if (!ALLOWED_MEDIA_TYPES.has(file.type.toLowerCase())) return 'invalid_type';
  if (file.size > BRANDING_IMAGE_LIMITS[role].maxIngressBytes) {
    return 'too_large';
  }
  return null;
}
