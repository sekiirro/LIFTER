import { describe, expect, it } from 'vitest';
import { BRANDING_IMAGE_LIMITS } from '../../lib/branding/image-validation';

describe('branding upload client pre-validation', () => {
  it('rejects an unsupported file type before the upload action is called', async () => {
    const { validateBrandingUploadFile } =
      await import('../../lib/branding/client-image-validation');

    expect(
      validateBrandingUploadFile({ type: 'image/jpeg', size: 1024 }, 'logo'),
    ).toBe('invalid_type');
  });

  it('rejects files over the role-specific ingress limit before upload', async () => {
    const { validateBrandingUploadFile } =
      await import('../../lib/branding/client-image-validation');

    expect(
      validateBrandingUploadFile(
        {
          type: 'image/png',
          size: BRANDING_IMAGE_LIMITS.logo.maxIngressBytes + 1,
        },
        'logo',
      ),
    ).toBe('too_large');
    expect(
      validateBrandingUploadFile(
        {
          type: 'image/webp',
          size: BRANDING_IMAGE_LIMITS.banner.maxIngressBytes + 1,
        },
        'banner',
      ),
    ).toBe('too_large');
  });

  it('accepts PNG and WebP at the shared server limit boundary', async () => {
    const { validateBrandingUploadFile } =
      await import('../../lib/branding/client-image-validation');

    expect(
      validateBrandingUploadFile(
        {
          type: 'image/png',
          size: BRANDING_IMAGE_LIMITS.logo.maxIngressBytes,
        },
        'logo',
      ),
    ).toBeNull();
    expect(
      validateBrandingUploadFile(
        {
          type: 'image/webp',
          size: BRANDING_IMAGE_LIMITS.banner.maxIngressBytes,
        },
        'banner',
      ),
    ).toBeNull();
  });
});
