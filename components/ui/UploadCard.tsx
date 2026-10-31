'use client';

import Image from 'next/image';
import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react';
import { getMessages, type Messages } from '../../lib/i18n';
import type { Locale } from '../../lib/design/preferences';
import { validateBrandingUploadFile } from '../../lib/branding/client-image-validation';
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

export type UploadCardStatus =
  | 'idle'
  | 'uploading'
  | 'attached'
  | 'error'
  | 'disabled'
  | 'stale'
  | 'interrupted';

export type UploadCardState = {
  status: UploadCardStatus;
  thumbnailUrl: string | null;
  selectedFile: File | null;
  errorCode: BrandingUploadErrorCode | null;
  errorKind: 'client' | 'identity' | 'server' | null;
  pendingAction: 'upload' | 'remove' | null;
  lastAction: 'upload' | 'remove';
};

export type UploadCardEvent =
  | { type: 'select'; file: File }
  | { type: 'identity-required' }
  | { type: 'start-upload' }
  | { type: 'start-remove' }
  | { type: 'client-rejected'; code: 'invalid_type' | 'too_large' }
  | { type: 'result'; result: BrandingAssetActionResult };

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

export function initialUploadCardState(
  thumbnailUrl?: string | null,
): UploadCardState {
  return {
    status: thumbnailUrl ? 'attached' : 'idle',
    thumbnailUrl: thumbnailUrl ?? null,
    selectedFile: null,
    errorCode: null,
    errorKind: null,
    pendingAction: null,
    lastAction: 'upload',
  };
}

export function reduceUploadCardState(
  state: UploadCardState,
  event: UploadCardEvent,
): UploadCardState {
  switch (event.type) {
    case 'select':
      return {
        ...state,
        selectedFile: event.file,
        errorCode: null,
        errorKind: null,
      };
    case 'identity-required':
      return {
        ...state,
        status: 'error',
        pendingAction: null,
        errorCode: null,
        errorKind: 'identity',
      };
    case 'start-upload':
      return {
        ...state,
        status: 'uploading',
        pendingAction: 'upload',
        lastAction: 'upload',
        errorCode: null,
        errorKind: null,
      };
    case 'start-remove':
      return {
        ...state,
        status: 'uploading',
        pendingAction: 'remove',
        lastAction: 'remove',
        errorCode: null,
        errorKind: null,
      };
    case 'client-rejected':
      return {
        ...state,
        status: 'error',
        selectedFile: null,
        pendingAction: null,
        errorCode: event.code,
        errorKind: 'client',
      };
    case 'result': {
      if (event.result.ok) {
        const removing = state.lastAction === 'remove';
        return {
          ...state,
          status: removing ? 'idle' : 'attached',
          thumbnailUrl: removing ? null : event.result.thumbnailUrl,
          selectedFile: null,
          pendingAction: null,
          errorCode: null,
          errorKind: null,
        };
      }
      if (event.result.code === 'stale_revision') {
        return {
          ...state,
          status: 'stale',
          selectedFile: null,
          pendingAction: null,
          errorCode: event.result.code,
          errorKind: 'server',
        };
      }
      return {
        ...state,
        status: event.result.code === 'interrupted' ? 'interrupted' : 'error',
        pendingAction: null,
        errorCode: event.result.code,
        errorKind: 'server',
      };
    }
  }
}

type ErrorRecovery = 'choose' | 'retry' | 'retry-disabled' | null;

export type UploadCardViewProps = {
  locale: Locale;
  role: BrandingAssetRole;
  status: UploadCardStatus;
  thumbnailUrl?: string | null;
  errorMessage?: string | null;
  identityOnlyConfirmed: boolean;
  pendingAction?: 'upload' | 'remove' | null;
  disabledReason?: string | null;
  errorRecovery?: ErrorRecovery;
  retryLabel?: string;
  onChoose: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onReloadDraft: () => void;
  onConfirmationChange: (confirmed: boolean) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  retryDisabled?: boolean;
  fileInputRef?: RefObject<HTMLInputElement | null>;
  replaceButtonRef?: RefObject<HTMLButtonElement | null>;
  removeButtonRef?: RefObject<HTMLButtonElement | null>;
  retryButtonRef?: RefObject<HTMLButtonElement | null>;
  reloadButtonRef?: RefObject<HTMLButtonElement | null>;
  statusRef?: RefObject<HTMLDivElement | null>;
};

export function UploadCardView({
  locale,
  role,
  status,
  thumbnailUrl,
  errorMessage,
  identityOnlyConfirmed,
  pendingAction = null,
  disabledReason = null,
  errorRecovery = null,
  retryLabel,
  onChoose,
  onReplace,
  onRemove,
  onRetry,
  onReloadDraft,
  onConfirmationChange,
  onFileChange,
  retryDisabled = false,
  fileInputRef,
  replaceButtonRef,
  removeButtonRef,
  retryButtonRef,
  reloadButtonRef,
  statusRef,
}: UploadCardViewProps) {
  const messages = getMessages(locale);
  const titleId = useId();
  const confirmationId = useId();
  const confirmationHintId = `${confirmationId}-hint`;
  const guidanceId = `${titleId}-guidance`;
  const label =
    messages[role === 'logo' ? 'branding.logoLabel' : 'branding.bannerLabel'];
  const guidance =
    messages[
      role === 'logo'
        ? 'branding.logoUploadGuidance'
        : 'branding.bannerUploadGuidance'
    ];
  const displayStatus = disabledReason ? 'disabled' : status;
  const showFilePicker = status === 'idle' && !disabledReason;
  const fileInputDisabled =
    Boolean(disabledReason) ||
    status === 'stale' ||
    status === 'interrupted' ||
    status === 'uploading';
  const stateClass = {
    idle: styles.stateIdle,
    uploading: styles.stateUploading,
    attached: styles.stateAttached,
    error: styles.stateError,
    disabled: styles.stateDisabled,
    stale: styles.stateStale,
    interrupted: styles.stateInterrupted,
  }[displayStatus];

  return (
    <section
      className={[styles.card, stateClass].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
      aria-busy={status === 'uploading' && !disabledReason ? true : undefined}
      data-upload-card={role}
      data-upload-state={displayStatus}
    >
      <header className={styles.header}>
        <h3 id={titleId} className={styles.title}>
          {label}
        </h3>
        <p id={guidanceId} className={styles.guidance}>
          <Bidi dir="ltr">{guidance}</Bidi>
        </p>
        {role === 'banner' && (
          <p className={styles.guidance}>
            {messages['branding.bannerSizeHint']}
          </p>
        )}
      </header>

      <div className={styles.filePicker} data-upload-file-picker={role}>
        <input
          ref={fileInputRef}
          className={styles.fileInput}
          type="file"
          accept="image/png,image/webp"
          onChange={onFileChange}
          tabIndex={showFilePicker ? 0 : -1}
          disabled={fileInputDisabled}
          hidden={!showFilePicker}
          aria-label={label}
          aria-describedby={guidanceId}
          data-upload-file-input={role}
        />
        {showFilePicker && (
          <span className={styles.filePickerText} aria-hidden="true">
            {messages['branding.chooseImage']}
          </span>
        )}
      </div>

      {role === 'banner' && (
        <div className={styles.confirmation}>
          <input
            id={confirmationId}
            type="checkbox"
            checked={identityOnlyConfirmed}
            onChange={(event) =>
              onConfirmationChange(event.currentTarget.checked)
            }
            disabled={Boolean(disabledReason) || status === 'stale'}
            aria-required="true"
            aria-describedby={confirmationHintId}
          />
          <div className={styles.confirmationCopy}>
            <label htmlFor={confirmationId}>
              {messages['branding.identityOnlyConfirm']}
            </label>
            <p id={confirmationHintId} className={styles.hint}>
              {messages['branding.identityOnlyRequired']}
            </p>
          </div>
        </div>
      )}

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
        {status === 'idle' &&
          (disabledReason ? (
            <Button type="button" disabled>
              {messages['branding.chooseImage']}
            </Button>
          ) : null)}
        {status === 'uploading' && (
          <Button type="button" loading disabled>
            {pendingAction === 'remove'
              ? messages['branding.removingImage']
              : messages['branding.uploadingImage']}
          </Button>
        )}
        {status === 'attached' && (
          <>
            <Button
              ref={replaceButtonRef}
              type="button"
              variant="secondary"
              onClick={onReplace}
              disabled={Boolean(disabledReason)}
              className={styles.controlButton}
            >
              {messages['branding.replaceImage']}
            </Button>
            <Button
              ref={removeButtonRef}
              type="button"
              variant="destructive"
              onClick={onRemove}
              disabled={Boolean(disabledReason)}
              className={styles.controlButton}
            >
              {messages['branding.removeImage']}
            </Button>
          </>
        )}
        {(status === 'error' || status === 'interrupted') &&
          (errorRecovery === 'choose' ? (
            <Button type="button" onClick={onChoose}>
              {messages['branding.chooseImage']}
            </Button>
          ) : (
            <Button
              ref={retryButtonRef}
              type="button"
              variant="secondary"
              onClick={onRetry}
              disabled={retryDisabled || Boolean(disabledReason)}
              className={styles.controlButton}
            >
              {retryLabel ?? messages['branding.retryImage']}
            </Button>
          ))}
        {status === 'stale' && (
          <Button
            ref={reloadButtonRef}
            type="button"
            variant="secondary"
            onClick={onReloadDraft}
            className={styles.controlButton}
          >
            {messages['branding.reloadDraft']}
          </Button>
        )}
      </div>

      <div
        ref={statusRef}
        className={styles.status}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={-1}
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
        {(status === 'error' || status === 'interrupted') && errorMessage && (
          <Alert
            tone="error"
            title={errorMessage}
            className={styles.statusAlert}
          />
        )}
        {status === 'stale' && (
          <Alert
            tone="error"
            title={messages['branding.staleRevision']}
            className={styles.statusAlert}
          />
        )}
        {disabledReason && (
          <p className={styles.disabledReason}>{disabledReason}</p>
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
  disabledReason?: string | null;
  onRevisionChange?: (revision: number) => void;
  onThumbnailChange?: (thumbnailUrl: string | null) => void;
  onResult?: (result: BrandingAssetActionResult) => void;
  onPendingChange?: (pending: boolean) => void;
  onReloadDraft?: () => void;
  uploadAction?: UploadBrandingAsset;
  removeAction?: RemoveBrandingAsset;
};

export function UploadCard({
  locale,
  workspaceId,
  expectedRevision,
  role,
  thumbnailUrl: initialThumbnailUrl,
  disabledReason = null,
  onRevisionChange,
  onThumbnailChange,
  onResult,
  onPendingChange,
  onReloadDraft,
  uploadAction = uploadBrandingAsset,
  removeAction = removeBrandingAsset,
}: UploadCardProps) {
  const messages = getMessages(locale);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceButtonRef = useRef<HTMLButtonElement>(null);
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const reloadButtonRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [state, dispatch] = useReducer(
    reduceUploadCardState,
    initialThumbnailUrl,
    initialUploadCardState,
  );
  const [identityOnlyConfirmed, setIdentityOnlyConfirmed] = useState(false);
  const previousState = useRef({
    status: state.status,
    lastAction: state.lastAction,
  });

  const choose = () => fileInputRef.current?.click();
  const replace = () => fileInputRef.current?.click();
  const reload = () => {
    if (onReloadDraft) {
      onReloadDraft();
      return;
    }
    if (typeof window !== 'undefined') window.location.reload();
  };

  useEffect(() => {
    const previous = previousState.current;
    previousState.current = {
      status: state.status,
      lastAction: state.lastAction,
    };

    if (state.status === 'uploading') {
      statusRef.current?.focus();
      return;
    }
    if (state.status === 'attached' && previous.status !== 'attached') {
      replaceButtonRef.current?.focus();
      return;
    }
    if (
      state.status === 'idle' &&
      previous.status === 'uploading' &&
      state.lastAction === 'remove'
    ) {
      fileInputRef.current?.focus();
      return;
    }
    if (state.status === 'stale') {
      reloadButtonRef.current?.focus();
      return;
    }
    if (
      (state.status === 'error' || state.status === 'interrupted') &&
      previous.status === 'uploading'
    ) {
      retryButtonRef.current?.focus();
    }
  }, [state.lastAction, state.status]);

  async function uploadFile(file: File, confirmed = identityOnlyConfirmed) {
    dispatch({ type: 'start-upload' });
    onPendingChange?.(true);
    let result: BrandingAssetActionResult;
    try {
      result = await uploadAction({
        workspaceId,
        expectedRevision,
        assetRole: role,
        file,
        identityOnlyConfirmed: confirmed,
      });
    } catch {
      result = { ok: false, code: 'interrupted' };
    }
    dispatch({ type: 'result', result });
    onResult?.(result);
    onPendingChange?.(false);
    if (result.ok) {
      onThumbnailChange?.(result.thumbnailUrl);
      onRevisionChange?.(result.newRevision);
    }
    return result;
  }

  async function removeFile() {
    dispatch({ type: 'start-remove' });
    onPendingChange?.(true);
    let result: BrandingAssetActionResult;
    try {
      result = await removeAction({
        workspaceId,
        expectedRevision,
        assetRole: role,
      });
    } catch {
      result = { ok: false, code: 'interrupted' };
    }
    dispatch({ type: 'result', result });
    onResult?.(result);
    onPendingChange?.(false);
    if (result.ok) {
      onThumbnailChange?.(null);
      onRevisionChange?.(result.newRevision);
    }
    return result;
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || state.pendingAction) return;

    const clientError = validateBrandingUploadFile(file, role);
    if (clientError) {
      dispatch({ type: 'client-rejected', code: clientError });
      onResult?.({ ok: false, code: clientError });
      return;
    }

    dispatch({ type: 'select', file });
    if (!canStartBrandingUpload(role, identityOnlyConfirmed)) {
      dispatch({ type: 'identity-required' });
      return;
    }
    void uploadFile(file);
  }

  function onConfirmationChange(confirmed: boolean) {
    setIdentityOnlyConfirmed(confirmed);
    if (confirmed && state.selectedFile && !state.pendingAction) {
      void uploadFile(state.selectedFile, true);
    }
  }

  function onRetry() {
    if (state.lastAction === 'remove') {
      void removeFile();
      return;
    }
    if (
      state.selectedFile &&
      canStartBrandingUpload(role, identityOnlyConfirmed)
    ) {
      void uploadFile(state.selectedFile);
    }
  }

  const errorRecovery: ErrorRecovery =
    state.status === 'error'
      ? state.errorKind === 'client'
        ? 'choose'
        : state.errorKind === 'identity'
          ? 'retry-disabled'
          : 'retry'
      : state.status === 'interrupted'
        ? 'retry'
        : null;
  const errorMessage =
    state.errorKind === 'identity'
      ? messages['branding.identityOnlyRequired']
      : state.errorCode
        ? brandingUploadErrorMessage(state.errorCode, messages)
        : null;

  return (
    <UploadCardView
      locale={locale}
      role={role}
      status={state.status}
      thumbnailUrl={state.thumbnailUrl}
      errorMessage={errorMessage}
      identityOnlyConfirmed={identityOnlyConfirmed}
      pendingAction={state.pendingAction}
      disabledReason={disabledReason}
      errorRecovery={errorRecovery}
      retryLabel={
        state.lastAction === 'remove'
          ? messages['branding.retryRemove']
          : messages['branding.retryImage']
      }
      onChoose={choose}
      onReplace={replace}
      onRemove={() => void removeFile()}
      onRetry={onRetry}
      onReloadDraft={reload}
      onConfirmationChange={onConfirmationChange}
      onFileChange={onFileChange}
      retryDisabled={state.errorKind === 'identity'}
      fileInputRef={fileInputRef}
      replaceButtonRef={replaceButtonRef}
      removeButtonRef={removeButtonRef}
      retryButtonRef={retryButtonRef}
      reloadButtonRef={reloadButtonRef}
      statusRef={statusRef}
    />
  );
}
