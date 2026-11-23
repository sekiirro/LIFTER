import {
  normalizeBrandDraft,
  type NormalizedBrandingDraft,
} from './validation';

export type BrandingActor = {
  id: string;
  role?: string;
};

export type BrandingDraft = {
  workspaceId: string;
  revision: number;
  fields: NormalizedBrandingDraft;
  assets?: Partial<Record<'logo' | 'banner', BrandingDraftAsset>>;
};

export type BrandingDraftAsset = {
  thumbnailUrl: string;
  bucket: 'branding-validated';
  object: string;
  contentType: 'image/png' | 'image/webp';
  byteSize: number;
};

export type BrandingVersion = {
  workspaceId: string;
  sequence: number;
  fields: NormalizedBrandingDraft;
};

export type PublishRepositoryResult =
  | { status: 'published'; current: BrandingVersion }
  | { status: 'unchanged'; current: BrandingVersion }
  | { status: 'stale' };

/**
 * The persistence adapter owns atomic revision CAS, per-workspace unique
 * sequence allocation, unchanged-publication detection, current-pointer
 * replacement, and current-only long-term retention atomically. Replaced
 * snapshots become GC-eligible when their remaining references are gone. It
 * must not expose history or a restore operation.
 */
export interface BrandingRepository {
  getDraft(workspaceId: string): Promise<BrandingDraft | null>;
  compareAndSetDraft(
    workspaceId: string,
    expectedRevision: number,
    fields: NormalizedBrandingDraft,
  ): Promise<BrandingDraft | null>;
  getCurrentPublication(workspaceId: string): Promise<BrandingVersion | null>;
  publishDraftCAS(
    workspaceId: string,
    expectedRevision: number,
    fields: NormalizedBrandingDraft,
  ): Promise<PublishRepositoryResult>;
}

export type BrandingServiceDependencies = {
  repository: BrandingRepository;
  /** Real manage_branding policy is wired by the later authorization unit. */
  authorize: (
    actor: BrandingActor,
    workspaceId: string,
  ) => boolean | Promise<boolean>;
};

export class BrandingServiceError extends Error {
  constructor(
    message: string,
    readonly code: 'denied' | 'invalid_scope' | 'stale_revision' | 'not_found',
  ) {
    super(message);
    this.name = 'BrandingServiceError';
  }
}

export function createBrandingService({
  repository,
  authorize,
}: BrandingServiceDependencies) {
  async function assertAuthorized(
    actor: BrandingActor,
    workspaceId: string,
  ): Promise<void> {
    if (!workspaceId.trim()) {
      throw new BrandingServiceError(
        'Explicit workspace scope required',
        'invalid_scope',
      );
    }
    if (!actor?.id || !(await authorize(actor, workspaceId))) {
      throw new BrandingServiceError('Branding access denied', 'denied');
    }
  }

  function validateRevision(expectedRevision: number): void {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new BrandingServiceError(
        'Invalid draft revision',
        'stale_revision',
      );
    }
  }

  async function saveDraft(input: {
    actor: BrandingActor;
    workspaceId: string;
    expectedRevision: number;
    fields: unknown;
  }): Promise<BrandingDraft> {
    await assertAuthorized(input.actor, input.workspaceId);
    validateRevision(input.expectedRevision);
    const fields = normalizeBrandDraft(input.fields);
    const current = await repository.getDraft(input.workspaceId);
    if ((current?.revision ?? 0) !== input.expectedRevision) {
      throw new BrandingServiceError(
        'Draft revision is stale',
        'stale_revision',
      );
    }
    const saved = await repository.compareAndSetDraft(
      input.workspaceId,
      input.expectedRevision,
      fields,
    );
    if (!saved) {
      throw new BrandingServiceError(
        'Draft revision is stale',
        'stale_revision',
      );
    }
    return saved;
  }

  async function publishDraft(input: {
    actor: BrandingActor;
    workspaceId: string;
    expectedRevision: number;
  }): Promise<
    | { status: 'published'; version: BrandingVersion }
    | { status: 'unchanged'; version: BrandingVersion }
  > {
    await assertAuthorized(input.actor, input.workspaceId);
    validateRevision(input.expectedRevision);
    const draft = await repository.getDraft(input.workspaceId);
    if (!draft) {
      throw new BrandingServiceError('Branding draft not found', 'not_found');
    }
    if (draft.revision !== input.expectedRevision) {
      throw new BrandingServiceError(
        'Draft revision is stale',
        'stale_revision',
      );
    }

    const fields = normalizeBrandDraft(draft.fields);
    const result = await repository.publishDraftCAS(
      input.workspaceId,
      input.expectedRevision,
      fields,
    );
    if (result.status === 'stale') {
      throw new BrandingServiceError(
        'Draft revision is stale',
        'stale_revision',
      );
    }
    if (result.status === 'unchanged') {
      return { status: 'unchanged', version: result.current };
    }
    return { status: 'published', version: result.current };
  }

  return { saveDraft, publishDraft };
}
