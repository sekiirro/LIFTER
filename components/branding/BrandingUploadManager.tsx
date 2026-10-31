'use client';

import { useState } from 'react';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import type {
  BrandingAssetActionResult,
  BrandingAssetRole,
  RemoveBrandingAsset,
  UploadBrandingAsset,
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
  canManage?: boolean;
  workspaceAvailable?: boolean;
  onReloadDraft?: () => void;
  uploadAction?: UploadBrandingAsset;
  removeAction?: RemoveBrandingAsset;
};

export function BrandingUploadManager({
  locale,
  workspaceId,
  initialRevision,
  initialThumbnails,
  draftFormId,
  publishFormId,
  canManage = true,
  workspaceAvailable = true,
  onReloadDraft,
  uploadAction,
  removeAction,
}: BrandingUploadManagerProps) {
  const messages = getMessages(locale);
  const [state, setState] = useState<BrandingUploadManagerState>({
    revision: initialRevision,
    thumbnails: {
      logo: initialThumbnails?.logo ?? null,
      banner: initialThumbnails?.banner ?? null,
    },
  });
  const [pendingRole, setPendingRole] = useState<BrandingAssetRole | null>(
    null,
  );
  const [staleRole, setStaleRole] = useState<BrandingAssetRole | null>(null);

  if (!canManage) return null;

  function handleResult(
    role: BrandingAssetRole,
    result: BrandingAssetActionResult,
  ) {
    setState((current) => applyBrandingAssetResult(current, result));
    if (!result.ok && result.code === 'stale_revision') {
      setStaleRole(role);
    }
  }

  function handlePendingChange(role: BrandingAssetRole, pending: boolean) {
    setPendingRole((current) => {
      if (pending) return role;
      return current === role ? null : current;
    });
  }

  function disabledReason(role: BrandingAssetRole): string | null {
    if (!workspaceAvailable) return messages['branding.workspaceUnavailable'];
    if (staleRole && staleRole !== role) {
      return messages['branding.staleRevision'];
    }
    if (pendingRole && pendingRole !== role) {
      return messages['branding.uploadInProgress'];
    }
    return null;
  }

  function reloadDraft() {
    if (onReloadDraft) {
      onReloadDraft();
      return;
    }
    if (typeof window !== 'undefined') window.location.reload();
  }

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
        disabledReason={disabledReason('logo')}
        onResult={(result) => handleResult('logo', result)}
        onPendingChange={(pending) => handlePendingChange('logo', pending)}
        onReloadDraft={reloadDraft}
        uploadAction={uploadAction}
        removeAction={removeAction}
      />
      <UploadCard
        locale={locale}
        workspaceId={workspaceId}
        expectedRevision={state.revision}
        role="banner"
        thumbnailUrl={state.thumbnails.banner}
        disabledReason={disabledReason('banner')}
        onResult={(result) => handleResult('banner', result)}
        onPendingChange={(pending) => handlePendingChange('banner', pending)}
        onReloadDraft={reloadDraft}
        uploadAction={uploadAction}
        removeAction={removeAction}
      />
    </div>
  );
}
