import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createBrandingUpload,
  interruptBrandingUpload,
  isBrandingUploadReferenceActive,
  transitionBrandingUpload,
} from '../../lib/branding/upload-state';
import { reconcileBrandingUpload } from '../../lib/branding/reconciliation';

function startUpload() {
  return createBrandingUpload({
    id: 'upload-1',
    workspaceId: 'workspace-a',
    role: 'logo',
    draftRevision: 4,
    stagingObjectKey: 'workspace-a/staging/upload-1',
  });
}

function contentHash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function advanceTo(
  stage: 'staging' | 'validation' | 'promotion' | 'attachment',
) {
  let upload = startUpload();
  if (
    stage === 'validation' ||
    stage === 'promotion' ||
    stage === 'attachment'
  ) {
    upload = transitionBrandingUpload(upload, { type: 'validation_started' });
  }
  if (stage === 'promotion' || stage === 'attachment') {
    upload = transitionBrandingUpload(upload, {
      type: 'validation_succeeded',
      validatedBytes: new Uint8Array([1, 2, 3]),
      contentHash: contentHash(new Uint8Array([1, 2, 3])),
    });
    upload = transitionBrandingUpload(upload, { type: 'promotion_started' });
  }
  if (stage === 'attachment') {
    upload = transitionBrandingUpload(upload, {
      type: 'promotion_succeeded',
      validatedObjectKey: `workspace-a/validated/logo/${contentHash(new Uint8Array([1, 2, 3]))}-upload-1`,
    });
    upload = transitionBrandingUpload(upload, { type: 'attachment_started' });
  }
  return upload;
}

describe('branding upload state and reconciliation contract', () => {
  it.each(['staging', 'validation', 'promotion', 'attachment'] as const)(
    'reconciles an interruption during %s and safely retries it',
    async (stage) => {
      const interrupted = interruptBrandingUpload(advanceTo(stage), stage);
      const storage = {
        inspect: vi
          .fn()
          .mockRejectedValueOnce(new Error('temporary storage error'))
          .mockResolvedValue({ present: false }),
        retryStage: vi.fn().mockResolvedValue({ completed: true }),
      };

      const first = await reconcileBrandingUpload(interrupted, { storage });
      expect(first.status).toBe('reconciliation_pending');

      const second = await reconcileBrandingUpload(first, { storage });
      const repeated = await reconcileBrandingUpload(second, { storage });
      expect(second.status).not.toBe('reconciliation_pending');
      expect(repeated).toEqual(second);
      expect(storage.retryStage).toHaveBeenCalledTimes(1);
    },
  );

  it('retains a retryable stale-revision attachment failure without changing the draft', () => {
    const validated = transitionBrandingUpload(
      transitionBrandingUpload(
        transitionBrandingUpload(startUpload(), { type: 'validation_started' }),
        {
          type: 'validation_succeeded',
          validatedBytes: new Uint8Array([1, 2, 3]),
          contentHash: contentHash(new Uint8Array([1, 2, 3])),
        },
      ),
      { type: 'promotion_started' },
    );
    const promoted = transitionBrandingUpload(validated, {
      type: 'promotion_succeeded',
      validatedObjectKey: `workspace-a/validated/logo/${contentHash(new Uint8Array([1, 2, 3]))}-upload-1`,
    });
    const result = transitionBrandingUpload(promoted, {
      type: 'attach',
      expectedDraftRevision: 4,
      currentDraftRevision: 5,
    });

    expect(result.status).toBe('attachment_failed_stale');
    expect(result.draftRevision).toBe(4);
    expect(result.attachedAssetId).toBeUndefined();
  });

  it('rejects a validator receipt when its claimed hash does not match bounded bytes', () => {
    const validating = transitionBrandingUpload(startUpload(), {
      type: 'validation_started',
    });
    expect(() =>
      transitionBrandingUpload(validating, {
        type: 'validation_succeeded',
        validatedBytes: new Uint8Array([1, 2, 3]),
        contentHash: 'a'.repeat(64),
      }),
    ).toThrow();
    expect(() =>
      transitionBrandingUpload(validating, {
        type: 'validation_succeeded',
        validatedBytes: new Uint8Array(4 * 1024 * 1024 + 1),
        contentHash: contentHash(new Uint8Array(0)),
      }),
    ).toThrow();
  });

  it('protects references held by active uploads until attachment or cleanup completes', () => {
    let upload = startUpload();
    expect(
      isBrandingUploadReferenceActive(upload, upload.stagingObjectKey),
    ).toBe(true);

    upload = transitionBrandingUpload(upload, { type: 'validation_started' });
    expect(
      isBrandingUploadReferenceActive(upload, upload.stagingObjectKey),
    ).toBe(true);

    const interrupted = interruptBrandingUpload(upload, 'validation');
    expect(
      isBrandingUploadReferenceActive(
        interrupted,
        interrupted.stagingObjectKey,
      ),
    ).toBe(true);
  });
});
