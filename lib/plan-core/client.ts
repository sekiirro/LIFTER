import {
  normalizeExpectedPublishedVersion,
  normalizePlanId,
  normalizePrivateDraft,
  normalizeReadinessState,
  PlanCoreValidationError,
  type PlanId,
  type ReadinessState,
} from './schemas';
import {
  normalizeCatalogSnapshotRef,
  type CatalogSnapshotRef,
} from './catalog-snapshot-ref';

export type PlanContentEnvelope = {
  kind: 'workout' | 'nutrition';
  schemaVersion: number;
  document: unknown;
};

export type DraftWriteRequest = {
  planId: PlanId;
  expectedDraftRevision: number;
  content: PlanContentEnvelope;
  operationKey: string;
  intent: 'autosave' | 'save_draft';
};

export type PublishRequest = {
  planId: PlanId;
  expectedPublishedVersion: number;
  operationKey: string;
};

export type PlanRevisionMetadataDto = {
  planId: PlanId;
  revisionId: string;
  revisionNumber: number;
  createdAt: string;
  authorId?: PlanId;
};

export type PublishedRevisionDto = PlanRevisionMetadataDto & {
  content: PlanContentEnvelope;
};

export type PrivateDraftDto = {
  planId: PlanId;
  draftId?: string;
  visibility: 'private';
  content?: PlanContentEnvelope;
  revision?: number;
  updatedAt?: string;
};

export type PlanRootDto = {
  planId: PlanId;
  draft?: PrivateDraftDto;
  currentRevision?: PlanRevisionMetadataDto;
  publishedVersion?: number;
  readiness?: ReadinessState;
};

export type DraftWriteData = { planId: PlanId; draft: PrivateDraftDto };
export type PublishData = { planId: PlanId; revision: PublishedRevisionDto };

export type PlanCoreErrorCode =
  | 'not_permitted'
  | 'invalid_input'
  | 'stale_version'
  | 'immutable_revision'
  | 'key_conflict'
  | 'unavailable';

export type PlanCoreSuccess<T> = {
  status: 'ok';
  replayed: boolean;
  data: T;
};

export type PlanCoreFailure = { status: PlanCoreErrorCode };
export type PlanCoreResponse<T> = PlanCoreSuccess<T> | PlanCoreFailure;

export interface PlanCoreTransport {
  getRoot(planId: PlanId): Promise<unknown>;
  writeDraft(request: DraftWriteRequest): Promise<unknown>;
  publish(request: PublishRequest): Promise<unknown>;
}

const ERROR_CODES: readonly PlanCoreErrorCode[] = [
  'not_permitted',
  'invalid_input',
  'stale_version',
  'immutable_revision',
  'key_conflict',
  'unavailable',
];

const ERROR_MESSAGES: Record<PlanCoreErrorCode, string> = {
  not_permitted: 'Plan Core request not permitted',
  invalid_input: 'Plan Core request invalid',
  stale_version: 'Plan Core version is stale',
  immutable_revision: 'Plan Core revision is immutable',
  key_conflict: 'Plan Core operation key conflicts',
  unavailable: 'Plan Core request unavailable',
};

export class PlanCoreClientError extends Error {
  constructor(readonly code: PlanCoreErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'PlanCoreClientError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value))
    throw new PlanCoreValidationError(`${label} must be an object`);
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new PlanCoreValidationError(`${label} contains an unknown field`);
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PlanCoreValidationError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireInteger(value: unknown, label: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new PlanCoreValidationError(`${label} must be an integer`);
  }
  return value;
}

function requireOperationKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new PlanCoreValidationError('Operation key must be a UUIDv4');
  }
  return value;
}

function normalizeDocument(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value))
    throw new PlanCoreValidationError('Document must not be cyclic');
  seen.add(value);
  if (Array.isArray(value)) {
    const output = value.map((entry) => normalizeDocument(entry, seen));
    seen.delete(value);
    return output;
  }
  const record = value as Record<string, unknown>;
  if (record.kind === 'exercise' || record.kind === 'food') {
    const reference: CatalogSnapshotRef = normalizeCatalogSnapshotRef(record);
    seen.delete(value);
    return reference;
  }
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    output[key] = normalizeDocument(child, seen);
  }
  seen.delete(value);
  return output;
}

export function normalizePlanContentEnvelope(
  input: unknown,
): PlanContentEnvelope {
  const value = requireRecord(input, 'Plan content envelope');
  exactKeys(
    value,
    ['kind', 'schemaVersion', 'document'],
    'Plan content envelope',
  );
  if (value.kind !== 'workout' && value.kind !== 'nutrition') {
    throw new PlanCoreValidationError('Plan content kind is invalid');
  }
  const schemaVersion = requireInteger(
    value.schemaVersion,
    'Schema version',
    1,
  );
  if (!Object.hasOwn(value, 'document')) {
    throw new PlanCoreValidationError('Plan content document is required');
  }
  return {
    kind: value.kind,
    schemaVersion,
    document: normalizeDocument(value.document),
  };
}

function normalizeRevisionMetadata(input: unknown): PlanRevisionMetadataDto {
  const value = requireRecord(input, 'Revision metadata');
  exactKeys(
    value,
    ['planId', 'revisionId', 'revisionNumber', 'createdAt', 'authorId'],
    'Revision metadata',
  );
  const planId = normalizePlanId(value.planId);
  const revisionId = normalizePlanId(value.revisionId);
  const revisionNumber = requireInteger(
    value.revisionNumber,
    'Revision number',
    1,
  );
  const createdAt = requireNonEmptyString(value.createdAt, 'Created at');
  const authorId =
    value.authorId === undefined ? undefined : normalizePlanId(value.authorId);
  return {
    planId,
    revisionId,
    revisionNumber,
    createdAt,
    ...(authorId ? { authorId } : {}),
  };
}

function normalizePublishedRevision(input: unknown): PublishedRevisionDto {
  const value = requireRecord(input, 'Published revision');
  exactKeys(
    value,
    [
      'planId',
      'revisionId',
      'revisionNumber',
      'createdAt',
      'authorId',
      'content',
    ],
    'Published revision',
  );
  if (!Object.hasOwn(value, 'content')) {
    throw new PlanCoreValidationError('Published revision content is required');
  }
  const { content: _content, ...metadata } = value;
  return freezeDeep({
    ...normalizeRevisionMetadata(metadata),
    content: normalizePlanContentEnvelope(value.content),
  });
}

function normalizePrivateDraftDto(input: unknown): PrivateDraftDto {
  const value = requireRecord(input, 'Private draft');
  const normalized = normalizePrivateDraft(value);
  return {
    ...normalized,
    ...(normalized.content !== undefined
      ? { content: normalizePlanContentEnvelope(normalized.content) }
      : {}),
  };
}

function normalizePlanRootDto(input: unknown): PlanRootDto {
  const value = requireRecord(input, 'Plan root');
  exactKeys(
    value,
    ['planId', 'draft', 'currentRevision', 'publishedVersion', 'readiness'],
    'Plan root',
  );
  const planId = normalizePlanId(value.planId);
  let draft: PrivateDraftDto | undefined;
  if (value.draft !== undefined) {
    draft = normalizePrivateDraftDto(value.draft);
    if (draft.planId !== planId)
      throw new PlanCoreValidationError('Draft Plan ID does not match root');
  }
  let currentRevision: PlanRevisionMetadataDto | undefined;
  if (value.currentRevision !== undefined) {
    currentRevision = normalizeRevisionMetadata(value.currentRevision);
    if (currentRevision.planId !== planId) {
      throw new PlanCoreValidationError('Revision Plan ID does not match root');
    }
  }
  let publishedVersion: number | undefined;
  if (value.publishedVersion !== undefined) {
    publishedVersion = requireInteger(
      value.publishedVersion,
      'Published version',
    );
  }
  let readiness: ReadinessState | undefined;
  if (value.readiness !== undefined)
    readiness = normalizeReadinessState(value.readiness);
  return {
    planId,
    ...(draft ? { draft } : {}),
    ...(currentRevision ? { currentRevision } : {}),
    ...(publishedVersion !== undefined ? { publishedVersion } : {}),
    ...(readiness ? { readiness } : {}),
  };
}

function normalizeDraftWriteRequest(input: unknown): DraftWriteRequest {
  const value = requireRecord(input, 'Draft write request');
  exactKeys(
    value,
    ['planId', 'expectedDraftRevision', 'content', 'operationKey', 'intent'],
    'Draft write request',
  );
  if (value.intent !== 'autosave' && value.intent !== 'save_draft') {
    throw new PlanCoreValidationError('Draft write intent is invalid');
  }
  return {
    planId: normalizePlanId(value.planId),
    expectedDraftRevision: requireInteger(
      value.expectedDraftRevision,
      'Expected draft revision',
    ),
    content: normalizePlanContentEnvelope(value.content),
    operationKey: requireOperationKey(value.operationKey),
    intent: value.intent,
  };
}

function normalizePublishRequest(input: unknown): PublishRequest {
  const value = requireRecord(input, 'Publish request');
  exactKeys(
    value,
    ['planId', 'expectedPublishedVersion', 'operationKey'],
    'Publish request',
  );
  return {
    planId: normalizePlanId(value.planId),
    expectedPublishedVersion: normalizeExpectedPublishedVersion(
      value.expectedPublishedVersion,
    ),
    operationKey: requireOperationKey(value.operationKey),
  };
}

function parseFailure<T>(value: unknown): PlanCoreResponse<T> | null {
  if (
    !isRecord(value) ||
    typeof value.status !== 'string' ||
    value.status === 'ok'
  )
    return null;
  const code = ERROR_CODES.find((candidate) => candidate === value.status);
  return { status: code ?? 'unavailable' };
}

function parseSuccess<T>(
  value: unknown,
  parseData: (data: unknown) => T,
): PlanCoreSuccess<T> {
  const record = requireRecord(value, 'Response envelope');
  exactKeys(record, ['status', 'replayed', 'data'], 'Response envelope');
  if (
    record.status !== 'ok' ||
    typeof record.replayed !== 'boolean' ||
    !Object.hasOwn(record, 'data')
  ) {
    throw new PlanCoreClientError('unavailable');
  }
  try {
    return {
      status: 'ok',
      replayed: record.replayed,
      data: parseData(record.data),
    };
  } catch {
    throw new PlanCoreClientError('unavailable');
  }
}

function mapLocalError(error: unknown): PlanCoreClientError {
  if (error instanceof PlanCoreClientError) return error;
  if (error instanceof PlanCoreValidationError || error instanceof Error) {
    return new PlanCoreClientError('invalid_input');
  }
  return new PlanCoreClientError('invalid_input');
}

async function invoke<T>(
  transport: () => Promise<unknown>,
  parseData: (data: unknown) => T,
): Promise<PlanCoreSuccess<T>> {
  let response: unknown;
  try {
    response = await transport();
  } catch {
    throw new PlanCoreClientError('unavailable');
  }
  try {
    const failure = parseFailure<T>(response);
    if (failure) throw new PlanCoreClientError(failure.status);
    return parseSuccess(response, parseData);
  } catch (error) {
    if (error instanceof PlanCoreClientError) throw error;
    throw new PlanCoreClientError('unavailable');
  }
}

export function createPlanCoreClient(transport: PlanCoreTransport) {
  return {
    async getRoot(planId: unknown): Promise<PlanCoreSuccess<PlanRootDto>> {
      let normalizedId: PlanId;
      try {
        normalizedId = normalizePlanId(planId);
      } catch (error) {
        throw mapLocalError(error);
      }
      return invoke(
        () => transport.getRoot(normalizedId),
        normalizePlanRootDto,
      );
    },

    async writeDraft(input: unknown): Promise<PlanCoreSuccess<DraftWriteData>> {
      let request: DraftWriteRequest;
      try {
        request = normalizeDraftWriteRequest(input);
      } catch (error) {
        throw mapLocalError(error);
      }
      return invoke(
        () => transport.writeDraft(request),
        (data) => {
          const value = requireRecord(data, 'Draft write result');
          exactKeys(value, ['planId', 'draft'], 'Draft write result');
          const planId = normalizePlanId(value.planId);
          if (planId !== request.planId)
            throw new PlanCoreValidationError('Draft result changed Plan ID');
          const draft = normalizePrivateDraftDto(value.draft);
          if (draft.planId !== planId)
            throw new PlanCoreValidationError(
              'Draft Plan ID does not match result',
            );
          return { planId, draft };
        },
      );
    },

    async publish(input: unknown): Promise<PlanCoreSuccess<PublishData>> {
      let request: PublishRequest;
      try {
        request = normalizePublishRequest(input);
      } catch (error) {
        throw mapLocalError(error);
      }
      return invoke(
        () => transport.publish(request),
        (data) => {
          const value = requireRecord(data, 'Publish result');
          exactKeys(value, ['planId', 'revision'], 'Publish result');
          const planId = normalizePlanId(value.planId);
          if (planId !== request.planId)
            throw new PlanCoreValidationError('Publish result changed Plan ID');
          const revision = normalizePublishedRevision(value.revision);
          if (revision.planId !== planId)
            throw new PlanCoreValidationError(
              'Revision Plan ID does not match result',
            );
          return { planId, revision };
        },
      );
    },
  };
}
