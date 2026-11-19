import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getMessages } from '../../lib/i18n';

vi.mock('../../lib/branding/client-contract', () => ({
  uploadBrandingAsset: vi.fn(),
  removeBrandingAsset: vi.fn(),
}));
vi.mock('../../app/(dashboard)/branding/upload-actions', () => ({
  uploadBrandingAsset: vi.fn(),
  removeBrandingAsset: vi.fn(),
}));

import {
  brandingUploadErrorMessage,
  canStartBrandingUpload,
  UploadCardView,
  type UploadCardStatus,
} from '../../components/ui/UploadCard';
import {
  applyBrandingAssetResult,
  BrandingUploadManager,
  type BrandingUploadManagerState,
} from '../../components/branding/BrandingUploadManager';

function renderCard(
  role: 'logo' | 'banner',
  status: UploadCardStatus,
  options?: {
    thumbnailUrl?: string | null;
    errorMessage?: string | null;
    identityOnlyConfirmed?: boolean;
    disabledReason?: string;
  },
) {
  return renderToStaticMarkup(
    createElement(UploadCardView, {
      locale: 'en',
      role,
      status,
      thumbnailUrl: options?.thumbnailUrl ?? null,
      errorMessage: options?.errorMessage ?? null,
      identityOnlyConfirmed: options?.identityOnlyConfirmed ?? false,
      pendingAction: null,
      onChoose: vi.fn(),
      onReplace: vi.fn(),
      onRemove: vi.fn(),
      onRetry: vi.fn(),
      onReloadDraft: vi.fn(),
      onConfirmationChange: vi.fn(),
      onFileChange: vi.fn(),
      ...(options?.disabledReason
        ? { disabledReason: options.disabledReason }
        : {}),
    }),
  );
}

describe('Upload Card states, roles, and accessibility', () => {
  it('renders an idle logo card with a native file control and live status', () => {
    const html = renderCard('logo', 'idle');
    const messages = getMessages('en');

    expect(html).toContain('data-upload-state="idle"');
    expect(html).toContain('data-upload-card="logo"');
    expect(html).toContain(`>${messages['branding.logoLabel']}</h3>`);
    expect(html).toContain('accept="image/png,image/webp"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('type="checkbox"');
  });

  it('renders an attached banner card with thumbnail, Replace, Remove, and confirmation', () => {
    const html = renderCard('banner', 'attached', {
      thumbnailUrl:
        '/api/branding/draft-image?workspace=workspace-1&role=banner',
      identityOnlyConfirmed: true,
    });
    const messages = getMessages('en');

    expect(html).toContain('data-upload-state="attached"');
    expect(html).toContain('data-upload-thumbnail="banner"');
    expect(html).toContain('/api/branding/draft-image?workspace=workspace-1');
    expect(html).toContain('role=banner');
    expect(html).toContain(messages['branding.replaceImage']);
    expect(html).toContain(messages['branding.removeImage']);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('aria-required="true"');
    expect(html).toContain(messages['branding.identityOnlyConfirm']);
  });

  it('renders uploading and error states with progress, busy, and recovery feedback', () => {
    const uploading = renderCard('logo', 'uploading');
    const failed = renderCard('logo', 'error', {
      errorMessage: getMessages('en')['branding.uploadFailed'],
    });

    expect(uploading).toContain('aria-busy="true"');
    expect(uploading).toContain(getMessages('en')['branding.uploadingImage']);
    expect(failed).toContain('data-upload-state="error"');
    expect(failed).toContain(getMessages('en')['branding.uploadFailed']);
    expect(failed).toContain(getMessages('en')['branding.retryImage']);
  });

  it('uses native keyboard-operable controls without positive tabindex values', () => {
    const html = renderCard('banner', 'attached', {
      identityOnlyConfirmed: true,
    });

    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).toContain('<input');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toMatch(/tabindex="[1-9]/i);
  });

  it('gates banner upload on identity-only confirmation but not logo upload', () => {
    expect(canStartBrandingUpload('banner', false)).toBe(false);
    expect(canStartBrandingUpload('banner', true)).toBe(true);
    expect(canStartBrandingUpload('logo', false)).toBe(true);
  });
});

describe('Upload Card error-code mapping', () => {
  it.each([
    'invalid_type',
    'too_large',
    'bad_dimensions',
    'forbidden',
    'interrupted',
    'server_error',
  ] as const)('maps %s to the approved upload failure guidance', (code) => {
    expect(brandingUploadErrorMessage(code, getMessages('en'))).toBe(
      getMessages('en')['branding.uploadFailed'],
    );
    expect(brandingUploadErrorMessage(code, getMessages('ar'))).toBe(
      getMessages('ar')['branding.uploadFailed'],
    );
  });

  it('reuses the stale revision copy for stale_revision', () => {
    expect(
      brandingUploadErrorMessage('stale_revision', getMessages('en')),
    ).toBe(getMessages('en')['branding.staleRevision']);
  });
});

describe('Upload Card hardening states and keyboard contract', () => {
  it('disables upload controls and exposes the reason while another action owns the workspace', () => {
    const html = renderCard('logo', 'idle', {
      disabledReason: 'Another branding action is still in progress.',
    });

    expect(html).toContain('data-upload-state="disabled"');
    expect(html).toContain('Another branding action is still in progress.');
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it('renders stale-revision recovery with the existing message and a reload action', () => {
    const html = renderCard('logo', 'stale' as UploadCardStatus, {
      errorMessage: getMessages('en')['branding.staleRevision'],
    });

    expect(html).toContain('data-upload-state="stale"');
    expect(html).toContain(getMessages('en')['branding.staleRevision']);
    expect(html).toContain('Reload draft');
  });

  it('renders an interrupted upload with the approved failure copy and retry recovery', () => {
    const html = renderCard('banner', 'interrupted' as UploadCardStatus, {
      errorMessage: getMessages('en')['branding.uploadFailed'],
    });

    expect(html).toContain('data-upload-state="interrupted"');
    expect(html).toContain(getMessages('en')['branding.uploadFailed']);
    expect(html).toContain(getMessages('en')['branding.retryImage']);
  });

  it('keeps the native file input in the banner keyboard path before confirmation', () => {
    const html = renderCard('banner', 'idle');
    const fileInput = html.indexOf('data-upload-file-input="banner"');
    const confirmation = html.indexOf('type="checkbox"');
    const fileInputTag = html.match(
      /<input(?=[^>]*data-upload-file-input="banner")[^>]*>/,
    )?.[0];

    expect(fileInput).toBeGreaterThan(-1);
    expect(confirmation).toBeGreaterThan(fileInput);
    expect(fileInputTag).toContain('tabindex="0"');
    expect(fileInputTag).not.toContain('tabindex="-1"');
  });

  it('uses the same semantic state class under light and dark themes', () => {
    const card = renderCard('logo', 'error', {
      errorMessage: getMessages('en')['branding.uploadFailed'],
    });
    const light = renderToStaticMarkup(
      createElement('div', { 'data-theme': 'light' }, card),
    );
    const dark = renderToStaticMarkup(
      createElement('div', { 'data-theme': 'dark' }, card),
    );

    expect(light).toMatch(/stateError/);
    expect(dark).toMatch(/stateError/);
  });

  it('preserves the prior asset and selected file after an interrupted upload', async () => {
    const { reduceUploadCardState } =
      await import('../../components/ui/UploadCard');
    const file = new File(['image'], 'logo.png', { type: 'image/png' });
    const next = reduceUploadCardState(
      {
        status: 'uploading',
        thumbnailUrl:
          '/api/branding/draft-image?workspace=workspace-1&role=logo',
        selectedFile: file,
        errorCode: null,
        errorKind: null,
        pendingAction: 'upload',
        lastAction: 'upload',
      },
      { type: 'result', result: { ok: false, code: 'interrupted' } },
    );

    expect(next.status).toBe('interrupted');
    expect(next.thumbnailUrl).toBe(
      '/api/branding/draft-image?workspace=workspace-1&role=logo',
    );
    expect(next.selectedFile).toBe(file);
  });

  it('disables every manager card when workspace access is unavailable', () => {
    const html = renderToStaticMarkup(
      createElement(BrandingUploadManager, {
        locale: 'en',
        workspaceId: 'workspace-1',
        initialRevision: 7,
        workspaceAvailable: false,
        draftFormId: 'branding-draft-form',
        publishFormId: 'branding-publish-form',
      }),
    );
    const messages = getMessages('en');

    expect(html.match(/data-upload-state="disabled"/g)).toHaveLength(2);
    expect(html).toContain(messages['branding.workspaceUnavailable']);
    expect(html.match(/<button[^>]*disabled/g)).toHaveLength(2);
  });

  it('renders no upload controls for a caller without branding access', () => {
    const html = renderToStaticMarkup(
      createElement(BrandingUploadManager, {
        locale: 'en',
        workspaceId: 'workspace-1',
        initialRevision: 7,
        canManage: false,
        draftFormId: 'branding-draft-form',
        publishFormId: 'branding-publish-form',
      }),
    );

    expect(html).not.toContain('data-branding-upload-manager');
    expect(html).not.toContain('data-upload-file-input');
    expect(html).not.toContain('<button');
  });
});

describe('branding page upload wiring', () => {
  const initialState: BrandingUploadManagerState = {
    revision: 7,
    thumbnails: {
      logo: '/api/branding/draft-image?workspace=workspace-1&role=logo&v=7',
      banner: '/api/branding/draft-image?workspace=workspace-1&role=banner&v=7',
    },
  };

  it('updates revision and thumbnail after an upload success', () => {
    const next = applyBrandingAssetResult(initialState, {
      ok: true,
      assetRole: 'banner',
      newRevision: 8,
      thumbnailUrl:
        '/api/branding/draft-image?workspace=workspace-1&role=banner&v=8',
    });

    expect(next.revision).toBe(8);
    expect(next.thumbnails.banner).toContain('v=8');
  });

  it('keeps the current asset after an upload failure', () => {
    const next = applyBrandingAssetResult(initialState, {
      ok: false,
      code: 'server_error',
    });

    expect(next).toBe(initialState);
    expect(next.thumbnails.banner).toBe(initialState.thumbnails.banner);
  });

  it('updates revision and clears the thumbnail after Remove succeeds', () => {
    const next = applyBrandingAssetResult(initialState, {
      ok: true,
      assetRole: 'logo',
      newRevision: 9,
      thumbnailUrl: null,
    });

    expect(next.revision).toBe(9);
    expect(next.thumbnails.logo).toBeNull();
    expect(next.thumbnails.banner).toBe(initialState.thumbnails.banner);
  });

  it('renders synchronized revision inputs for draft save and publish', () => {
    const html = renderToStaticMarkup(
      createElement(BrandingUploadManager, {
        locale: 'en',
        workspaceId: 'workspace-1',
        initialRevision: 7,
        initialThumbnails: {
          logo: '/api/branding/draft-image?workspace=workspace-1&role=logo&v=7',
        },
        draftFormId: 'branding-draft-form',
        publishFormId: 'branding-publish-form',
      }),
    );

    expect(html).toContain('data-upload-revision="branding-draft-form"');
    expect(html).toContain('data-upload-revision="branding-publish-form"');
    expect(html.match(/name="revision" value="7"/g)).toHaveLength(2);
  });
});
