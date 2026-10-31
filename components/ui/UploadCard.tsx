'use client';

import Image from 'next/image';
import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react';
import { getMessages, type Messages } from '../../lib/i18n';
import type { Locale } from '../../lib/design/preferences';
import type {
  BrandingAssetActionResult,
  BrandingAssetRole,
  BrandingUploadErrorCode,
  RemoveBrandingAsset,
  UploadBrandingAsset,
} from '../../lib/branding/client-contract';
import {
  removeBrandingAsset,
  uploadBrandingAsset,
} from '../../app/(dashboard)/branding/upload-actions';
import { Alert } from './Alert';
import { Bidi } from './Bidi';
import { Button } from './Button';
import styles from './UploadCard.module.css';

export type UploadCardStatus = 'idle' | 'uploading' | 'attached' | 'error';

export function canStartBrandingUpload(
  role: BrandingAssetRole,
  identityOnlyConfirmed: boolean,
): boolean {
  return role === 'logo' || identityOnlyConfirmed;
}

export function brandingUploadErrorMessage(
  code: BrandingUploadErrorCode,
  messages: Messages,
): string {
  return code === 'stale_revision'
    ? messages['branding.staleRevision']
    : messages['branding.uploadFailed'];
}

export type UploadCardViewProps = {
  locale: Locale;
  role: BrandingAssetRole;
  status: UploadCardStatus;
  thumbnailUrl?: string | null;
  errorMessage?: string | null;
  identityOnlyConfirmed: boolean;
  pendingAction?: 'upload' | 'remove' | null;
  onChoose: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onConfirmationChange: (confirmed: boolean) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  retryDisabled?: boolean;
  fileInputRef?: RefObject<HTMLInputElement | null>;
};

export function UploadCardView({
  locale,
  role,
  status,
  thumbnailUrl,
  errorMessage,
  identityOnlyConfirmed,
  pendingAction = null,
  onChoose,
  onReplace,
  onRemove,
  onRetry,
  onConfirmationChange,
  onFileChange,
  retryDisabled = false,
  fileInputRef,
}: UploadCardViewProps) {
  const messages = getMessages(locale);
  const titleId = useId();
  const confirmationId = useId();
  const confirmationHintId = `${confirmationId}-hint`;
  const label =
    messages[role === 'logo' ? 'branding.logoLabel' : 'branding.bannerLabel'];
  const guidance =
    messages[
      role === 'logo'
        ? 'branding.logoUploadGuidance'
        : 'branding.bannerUploadGuidance'
    ];

  return (
    <section
      className={styles.card}
      aria-labelledby={titleId}
      aria-busy={status === 'uploading' || undefined}
      data-upload-card={role}
      data-upload-state={status}
    >
      <header className={styles.header}>
        <h3 id={titleId} className={styles.title}>
          {label}
        </h3>
        <p className={styles.guidance}>
          <Bidi dir="ltr">{guidance}</Bidi>
        </p>
        {role === 'banner' && (
          <>
            <p className={styles.guidance}>
              {messages['branding.bannerSizeHint']}
            </p>
            <div className={styles.confirmation}>
              <input
                id={confirmationId}
                type="checkbox"
                checked={identityOnlyConfirmed}
                onChange={(event) =>
                  onConfirmationChange(event.currentTarget.checked)
                }
                aria-required="true"
                aria-describedby={confirmationHintId}
              />
              <div>
                <label htmlFor={confirmationId}>
                  {messages['branding.identityOnlyConfirm']}
                </label>
                <p id={confirmationHintId} className={styles.hint}>
                  {messages['branding.identityOnlyRequired']}
                </p>
              </div>
            </div>
          </>
        )}
      </header>

      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        accept="image/png,image/webp"
        onChange={onFileChange}
        tabIndex={-1}
        aria-label={label}
        data-upload-file-input={role}
      />

      {thumbnailUrl && (
        <div
          className={[
            styles.thumbnail,
            role === 'logo' ? styles.logoThumbnail : styles.bannerThumbnail,
          ]
            .filter(Boolean)
            .join(' ')}
          data-upload-thumbnail={role}
        >
          <Image
            src={thumbnailUrl}
            alt=""
            unoptimized
            width={role === 'logo' ? 2048 : 4096}
            height={role === 'logo' ? 2048 : 2048}
          />
        </div>
      )}

      <div className={styles.controls}>
        {status === 'idle' && (
          <Button type="button" onClick={onChoose}>
            {messages['branding.chooseImage']}
          </Button>
        )}
        {status === 'uploading' && (
          <Button type="button" loading disabled>
            {pendingAction === 'remove'
              ? messages['branding.removingImage']
              : messages['branding.uploadingImage']}
          </Button>
        )}
        {status === 'attached' && (
          <>
            <Button type="button" variant="secondary" onClick={onReplace}>
              {messages['branding.replaceImage']}
            </Button>
            <Button type="button" variant="destructive" onClick={onRemove}>
              {messages['branding.removeImage']}
            </Button>
          </>
        )}
        {status === 'error' && (
          <Button
            type="button"
            variant="secondary"
            onClick={onRetry}
            disabled={retryDisabled}
          >
            {messages['branding.retryImage']}
          </Button>
        )}
      </div>

      <div
        className={styles.status}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-upload-status={role}
      >
        {status === 'uploading' && (
          <p className={styles.statusText}>
            {pendingAction === 'remove'
              ? messages['branding.removingImage']
              : messages['branding.uploadingImage']}
          </p>
        )}
        {status === 'attached' && (
          <p className={styles.statusText}>
            {messages['branding.imageAttached']}
          </p>
        )}
        {status === 'error' && errorMessage && (
          <Alert tone="error" title={errorMessage} />
        )}
      </div>
    </section>
  );
}

export type UploadCardProps = {
  locale: Locale;
  workspaceId: string;
  expectedRevision: number;
  role: BrandingAssetRole;
  thumbnailUrl?: string | null;
  onRevisionChange?: (revision: number) => void;
  onThumbnailChange?: (thumbnailUrl: string | null) => void;
  onResult?: (result: BrandingAssetActionResult) => void;
  uploadAction?: UploadBrandingAsset;
  removeAction?: RemoveBrandingAsset;
};

export function UploadCard({
  locale,
  workspaceId,
  expectedRevision,
  role,
  thumbnailUrl: initialThumbnailUrl,
  onRevisionChange,
  onThumbnailChange,
  onResult,
  uploadAction = uploadBrandingAsset,
  removeAction = removeBrandingAsset,
}: UploadCardProps) {
  const messages = getMessages(locale);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadCardStatus>(
    initialThumbnailUrl ? 'attached' : 'idle',
  );
  const [thumbnailUrl, setThumbnailUrl] = useState(initialThumbnailUrl ?? null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [identityOnlyConfirmed, setIdentityOnlyConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    'upload' | 'remove' | null
  >(null);
  const [lastAction, setLastAction] = useState<'upload' | 'remove'>('upload');

  const choose = () => fileInputRef.current?.click();
  const replace = () => fileInputRef.current?.click();

  async function uploadFile(file: File, confirmed = identityOnlyConfirmed) {
    setStatus('uploading');
    setPendingAction('upload');
    setErrorMessage(null);
    setLastAction('upload');
    const result = await uploadAction({
      workspaceId,
      expectedRevision,
      assetRole: role,
      file,
      identityOnlyConfirmed: confirmed,
    });
    setPendingAction(null);
    if (!result.ok) {
      setErrorMessage(brandingUploadErrorMessage(result.code, messages));
      setStatus('error');
      return result;
    }
    setThumbnailUrl(result.thumbnailUrl);
    onThumbnailChange?.(result.thumbnailUrl);
    onRevisionChange?.(result.newRevision);
    onResult?.(result);
    setSelectedFile(null);
    setStatus('attached');
    return result;
  }

  async function removeFile() {
    setStatus('uploading');
    setPendingAction('remove');
    setErrorMessage(null);
    setLastAction('remove');
    const result = await removeAction({
      workspaceId,
      expectedRevision,
      assetRole: role,
    });
    setPendingAction(null);
    if (!result.ok) {
      setErrorMessage(brandingUploadErrorMessage(result.code, messages));
      setStatus('error');
      return result;
    }
    setThumbnailUrl(null);
    onThumbnailChange?.(null);
    onRevisionChange?.(result.newRevision);
    onResult?.(result);
    setSelectedFile(null);
    setStatus('idle');
    return result;
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setSelectedFile(file);
    if (!canStartBrandingUpload(role, identityOnlyConfirmed)) {
      setErrorMessage(messages['branding.identityOnlyRequired']);
      setStatus('error');
      return;
    }
    void uploadFile(file);
  }

  function onConfirmationChange(confirmed: boolean) {
    setIdentityOnlyConfirmed(confirmed);
    if (confirmed && selectedFile) void uploadFile(selectedFile, true);
  }

  function onRetry() {
    if (lastAction === 'remove') {
      void removeFile();
      return;
    }
    if (selectedFile && canStartBrandingUpload(role, identityOnlyConfirmed)) {
      void uploadFile(selectedFile);
    }
  }

  return (
    <UploadCardView
      locale={locale}
      role={role}
      status={status}
      thumbnailUrl={thumbnailUrl}
      errorMessage={errorMessage}
      identityOnlyConfirmed={identityOnlyConfirmed}
      pendingAction={pendingAction}
      onChoose={choose}
      onReplace={replace}
      onRemove={() => void removeFile()}
      onRetry={onRetry}
      onConfirmationChange={onConfirmationChange}
      onFileChange={onFileChange}
      retryDisabled={lastAction === 'upload' && !identityOnlyConfirmed}
      fileInputRef={fileInputRef}
    />
  );
}
