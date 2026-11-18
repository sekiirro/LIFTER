/**
 * F14b owner upload contract for the branding editor.
 * Upload starts on selection and attaches only to the current draft.
 * Banner callers must send the identity-only confirmation flag.
 * Neither operation publishes; publication remains a separate owner action.
 * The server enforces the repository's PNG/WebP and image-processing limits.
 * Success carries the new draft revision and an authenticated thumbnail URL.
 * The draft read response restores bilingual alt text and saved preview handles.
 * Errors are sanitized stable codes suitable for localized UI messages.
 * Import these signatures and result types from this file in the UI lane.
 */
export type BrandingAssetRole = 'logo' | 'banner';

export type BrandingUploadErrorCode =
  | 'invalid_type'
  | 'too_large'
  | 'bad_dimensions'
  | 'stale_revision'
  | 'forbidden'
  | 'interrupted'
  | 'server_error';

export type BrandingAssetActionResult =
  | {
      ok: true;
      assetRole: BrandingAssetRole;
      newRevision: number;
      thumbnailUrl: string | null;
    }
  | { ok: false; code: BrandingUploadErrorCode };

export type BrandingDraftPreviewHandle = {
  thumbnailUrl: string;
  bucket: 'branding-validated';
  object: string;
  contentType: 'image/png' | 'image/webp';
  byteSize: number;
};

export type BrandingDraftReadContract = {
  workspaceId: string;
  revision: number;
  fields: {
    names: { ar: string; en: string };
    bannerAltText?: { ar: string; en: string };
    color: string;
  };
  assets: Partial<Record<BrandingAssetRole, BrandingDraftPreviewHandle>>;
};

export type UploadBrandingAsset = (input: {
  workspaceId: string;
  expectedRevision: number;
  assetRole: BrandingAssetRole;
  file: File;
  identityOnlyConfirmed: boolean;
}) => Promise<BrandingAssetActionResult>;

export type RemoveBrandingAsset = (input: {
  workspaceId: string;
  expectedRevision: number;
  assetRole: BrandingAssetRole;
}) => Promise<BrandingAssetActionResult>;

export {
  uploadBrandingAsset,
  removeBrandingAsset,
} from '../../app/(dashboard)/branding/upload-actions';
