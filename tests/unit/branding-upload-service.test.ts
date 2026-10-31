import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  createBrandingUploadService,
  type BrandingUploadServiceDependencies,
} from '../../lib/branding/upload-service';

const input = (role: 'logo' | 'banner' = 'logo') => ({
  workspaceId: 'c671d83a-9870-41cb-82cd-1c93a0484d8d',
  expectedRevision: 4,
  assetRole: role,
  file: new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])],
    'brand.png',
  ),
  identityOnlyConfirmed: role === 'banner',
});
const validatedBytes = new Uint8Array([1, 2, 3]);
const validatedHash = createHash('sha256').update(validatedBytes).digest('hex');

function dependencies(
  overrides: Partial<BrandingUploadServiceDependencies> = {},
) {
  const calls: string[] = [];
  const deps: BrandingUploadServiceDependencies = {
    authorize: vi.fn(async () => true),
    beginUpload: vi.fn(async () => {
      calls.push('begin');
      return 'upload-id';
    }),
    stage: vi.fn(async () => {
      calls.push('stage');
    }),
    inspectStaging: vi.fn(async () => true),
    retryStaging: vi.fn(async () => true),
    validate: vi.fn(() => {
      calls.push('validate');
      return {
        bytes: validatedBytes,
        contentHash: validatedHash,
        height: 1,
        mediaType: 'image/png' as const,
        width: 1,
      };
    }),
    prepare: vi.fn(async () => {
      calls.push('prepare');
    }),
    promote: vi.fn(async (workspaceId, role, uploadId, result) => {
      calls.push('promote');
      return `${workspaceId}/validated/${role}/${result.contentHash}-${uploadId}.png`;
    }),
    complete: vi.fn(async () => {
      calls.push('complete');
    }),
    attach: vi.fn(async () => {
      calls.push('attach');
      return 5;
    }),
    readAfterAmbiguousAttach: vi.fn(async () => null),
  };
  return { deps: { ...deps, ...overrides }, calls };
}

describe('branding upload service', () => {
  it('runs the authorized validation pipeline in order and returns the new draft handle', async () => {
    const { deps, calls } = dependencies();
    const result = await createBrandingUploadService(deps).upload(input());
    expect(calls).toEqual([
      'begin',
      'stage',
      'validate',
      'prepare',
      'promote',
      'complete',
      'attach',
    ]);
    expect(result).toEqual({
      ok: true,
      assetRole: 'logo',
      newRevision: 5,
      thumbnailUrl: expect.stringContaining('/api/branding/draft-image?'),
    });
  });

  it('denies unauthorized callers without starting an upload', async () => {
    const { deps } = dependencies({ authorize: vi.fn(async () => false) });
    await expect(
      createBrandingUploadService(deps).upload(input()),
    ).resolves.toEqual({
      ok: false,
      code: 'forbidden',
    });
    expect(deps.beginUpload).not.toHaveBeenCalled();
  });

  it('reconciles an interrupted staging response idempotently before validation', async () => {
    const { deps } = dependencies({
      stage: vi.fn(async () => {
        throw new Error('storage response interrupted');
      }),
      inspectStaging: vi.fn(async () => true),
      retryStaging: vi.fn(async () => true),
    });
    await expect(
      createBrandingUploadService(deps).upload(input()),
    ).resolves.toMatchObject({ ok: true, newRevision: 5 });
    expect(deps.retryStaging).toHaveBeenCalledOnce();
    expect(deps.validate).toHaveBeenCalledOnce();
  });

  it('returns forbidden when storage authority is revoked after begin', async () => {
    const { deps } = dependencies({
      stage: vi.fn(async () => {
        throw Object.assign(new Error('RLS denied'), { code: '42501' });
      }),
    });
    await expect(
      createBrandingUploadService(deps).upload(input()),
    ).resolves.toEqual({ ok: false, code: 'forbidden' });
    expect(deps.retryStaging).not.toHaveBeenCalled();
  });

  it('requires identity confirmation for banners and enforces the actual role size limit', async () => {
    const banner = dependencies();
    await expect(
      createBrandingUploadService(banner.deps).upload({
        ...input('banner'),
        identityOnlyConfirmed: false,
      }),
    ).resolves.toEqual({ ok: false, code: 'forbidden' });
    expect(banner.deps.beginUpload).not.toHaveBeenCalled();

    const oversized = dependencies();
    const large = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.png');
    await expect(
      createBrandingUploadService(oversized.deps).upload({
        ...input(),
        file: large,
      }),
    ).resolves.toEqual({ ok: false, code: 'too_large' });
    expect(oversized.deps.beginUpload).not.toHaveBeenCalled();
  });

  it('preserves existing attachment authority on validation, promotion, and stale attach failures', async () => {
    for (const [override, code] of [
      [
        {
          validate: vi.fn(() => {
            throw Object.assign(new Error(), { code: 'bad_dimensions' });
          }),
        },
        'bad_dimensions',
      ],
      [
        {
          promote: vi.fn(async () => {
            throw new Error('private storage detail');
          }),
        },
        'interrupted',
      ],
      [
        {
          attach: vi.fn(async () => {
            throw Object.assign(new Error(), { code: '40001' });
          }),
        },
        'stale_revision',
      ],
    ] as const) {
      const { deps } = dependencies(override);
      await expect(
        createBrandingUploadService(deps).upload(input()),
      ).resolves.toEqual({
        ok: false,
        code,
      });
    }
  });

  it('returns success after an ambiguous attach only when the persisted draft proves the same upload committed', async () => {
    const readAfterAmbiguousAttach = vi.fn(async () => ({
      revision: 5,
      object: `${input().workspaceId}/validated/logo/${validatedHash}-upload-id.png`,
    }));
    const { deps } = dependencies({
      attach: vi.fn(async () => {
        throw new Error('response lost');
      }),
      readAfterAmbiguousAttach,
    });
    await expect(
      createBrandingUploadService(deps).upload(input()),
    ).resolves.toMatchObject({
      ok: true,
      newRevision: 5,
    });
  });

  it('makes a retry after a lost success response idempotent at the stale begin guard', async () => {
    const readAfterAmbiguousAttach = vi.fn(async () => ({
      revision: 5,
      object: `${input().workspaceId}/validated/logo/${validatedHash}-first-upload.png`,
    }));
    const { deps } = dependencies({
      beginUpload: vi.fn(async () => {
        throw Object.assign(new Error('stale'), { code: '40001' });
      }),
      readAfterAmbiguousAttach,
    });
    await expect(
      createBrandingUploadService(deps).upload(input()),
    ).resolves.toMatchObject({ ok: true, newRevision: 5 });
    expect(deps.stage).not.toHaveBeenCalled();
    expect(deps.attach).not.toHaveBeenCalled();
  });
});
