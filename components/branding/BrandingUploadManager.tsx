'use client';

import { useState } from 'react';
import type { Locale } from '../../lib/design/preferences';
import type {
  BrandingAssetActionResult,
  BrandingAssetRole,
} from '../../lib/branding/client-contract';
import { UploadCard } from '../ui/UploadCard';
import styles from './BrandingUploadManager.module.css';

export type BrandingUploadManagerState = {
  revision: number;
  thumbnails: Record<BrandingAssetRole, string | null>;
};

export function applyBrandingAssetResult(
  state: BrandingUploadManagerState,
  result: BrandingAssetActionResult,
): BrandingUploadManagerState {
  if (!result.ok) return state;
  return {
    revision: result.newRevision,
    thumbnails: {
      ...state.thumbnails,
      [result.assetRole]: result.thumbnailUrl,
    },
  };
}

export type BrandingUploadManagerProps = {
  locale: Locale;
  workspaceId: string;
  initialRevision: number;
  initialThumbnails?: Partial<Record<BrandingAssetRole, string | null>>;
  draftFormId: string;
  publishFormId: string;
};

export function BrandingUploadManager({
  locale,
  workspaceId,
  initialRevision,
  initialThumbnails,
  draftFormId,
  publishFormId,
}: BrandingUploadManagerProps) {
  const [state, setState] = useState<BrandingUploadManagerState>({
    revision: initialRevision,
    thumbnails: {
      logo: initialThumbnails?.logo ?? null,
      banner: initialThumbnails?.banner ?? null,
    },
  });

  return (
    <div className={styles.manager} data-branding-upload-manager="">
      <input
        type="hidden"
        name="revision"
        value={state.revision}
        form={draftFormId}
        data-upload-revision={draftFormId}
      />
      <input
        type="hidden"
        name="revision"
        value={state.revision}
        form={publishFormId}
        data-upload-revision={publishFormId}
      />
      <UploadCard
        locale={locale}
        workspaceId={workspaceId}
        expectedRevision={state.revision}
        role="logo"
        thumbnailUrl={state.thumbnails.logo}
        onResult={(result) =>
          setState((current) => applyBrandingAssetResult(current, result))
        }
      />
      <UploadCard
        locale={locale}
        workspaceId={workspaceId}
        expectedRevision={state.revision}
        role="banner"
        thumbnailUrl={state.thumbnails.banner}
        onResult={(result) =>
          setState((current) => applyBrandingAssetResult(current, result))
        }
      />
    </div>
  );
}
