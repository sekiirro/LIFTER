'use client';

import { useState } from 'react';
import type { Locale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import type {
  BrandingAssetActionResult,
  RemoveBrandingAsset,
  UploadBrandingAsset,
} from '../../../../lib/branding/client-contract';
import {
  UploadCard,
  UploadCardView,
} from '../../../../components/ui/UploadCard';
import { BrandingUploadManager } from '../../../../components/branding/BrandingUploadManager';

const thumbnail =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export function UploadHardeningShowcase({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const [interruptedAttempts, setInterruptedAttempts] = useState(0);
  const uploadAction: UploadBrandingAsset = async (input) => ({
    ok: true,
    assetRole: input.assetRole,
    newRevision: input.expectedRevision + 1,
    thumbnailUrl: thumbnail,
  });
  const removeAction: RemoveBrandingAsset = async (input) => ({
    ok: true,
    assetRole: input.assetRole,
    newRevision: input.expectedRevision + 1,
    thumbnailUrl: null,
  });
  const interruptedUploadAction: UploadBrandingAsset = async () => {
    setInterruptedAttempts((current) => current + 1);
    throw new Error('simulated network interruption');
  };
  const pendingUploadAction: UploadBrandingAsset = () =>
    new Promise<BrandingAssetActionResult>(() => undefined);

  return (
    <>
      <div data-upload-interactive-card="">
        <UploadCard
          locale={locale}
          workspaceId="00000000-0000-4000-8000-000000000001"
          expectedRevision={7}
          role="banner"
          uploadAction={uploadAction}
          removeAction={removeAction}
        />
      </div>
      <div
        data-upload-interrupted-card=""
        data-upload-interrupted-attempts={interruptedAttempts}
      >
        <UploadCard
          locale={locale}
          workspaceId="00000000-0000-4000-8000-000000000001"
          expectedRevision={7}
          role="logo"
          thumbnailUrl={thumbnail}
          uploadAction={interruptedUploadAction}
          removeAction={removeAction}
        />
      </div>
      <div data-upload-manager-showcase="">
        <BrandingUploadManager
          locale={locale}
          workspaceId="00000000-0000-4000-8000-000000000001"
          initialRevision={7}
          initialThumbnails={{ banner: thumbnail }}
          draftFormId="showcase-draft-form"
          publishFormId="showcase-publish-form"
          uploadAction={pendingUploadAction}
          removeAction={removeAction}
        />
      </div>
      <div data-upload-hardening-states="">
        <UploadCardView
          locale={locale}
          role="logo"
          status="disabled"
          identityOnlyConfirmed={false}
          disabledReason={messages['branding.workspaceUnavailable']}
          onChoose={() => undefined}
          onReplace={() => undefined}
          onRemove={() => undefined}
          onRetry={() => undefined}
          onReloadDraft={() => undefined}
          onConfirmationChange={() => undefined}
          onFileChange={() => undefined}
        />
        <UploadCardView
          locale={locale}
          role="banner"
          status="stale"
          identityOnlyConfirmed={false}
          onChoose={() => undefined}
          onReplace={() => undefined}
          onRemove={() => undefined}
          onRetry={() => undefined}
          onReloadDraft={() => undefined}
          onConfirmationChange={() => undefined}
          onFileChange={() => undefined}
        />
        <UploadCardView
          locale={locale}
          role="logo"
          status="interrupted"
          identityOnlyConfirmed={false}
          errorMessage={messages['branding.uploadFailed']}
          errorRecovery="retry"
          onChoose={() => undefined}
          onReplace={() => undefined}
          onRemove={() => undefined}
          onRetry={() => undefined}
          onReloadDraft={() => undefined}
          onConfirmationChange={() => undefined}
          onFileChange={() => undefined}
        />
      </div>
    </>
  );
}
