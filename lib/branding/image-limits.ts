export type BrandingImageRole = 'logo' | 'banner';
export type BrandingMediaType = 'image/png' | 'image/webp';

export type BrandingImageLimits = {
  maxIngressBytes: number;
  maxOutputBytes: number;
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
  maxChunks: number;
};

/**
 * Shared ingress and processing limits. The browser uses only the ingress
 * byte limit for an early rejection; the server remains authoritative for
 * type, dimensions, and every processing limit.
 */
export const BRANDING_IMAGE_LIMITS: Record<
  BrandingImageRole,
  BrandingImageLimits
> = {
  logo: {
    maxIngressBytes: 4 * 1024 * 1024,
    maxOutputBytes: 4 * 1024 * 1024,
    maxWidth: 2048,
    maxHeight: 2048,
    maxPixels: 1_000_000,
    maxChunks: 96,
  },
  banner: {
    maxIngressBytes: 8 * 1024 * 1024,
    maxOutputBytes: 8 * 1024 * 1024,
    maxWidth: 4096,
    maxHeight: 2048,
    maxPixels: 4_000_000,
    maxChunks: 192,
  },
};
