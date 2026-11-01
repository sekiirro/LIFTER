/**
 * Shared Plan Core (F19) lifecycle schemas.
 *
 * Pure TypeScript contracts only: no database, auth, or RLS concerns.
 * These freeze the stable Plan ID, private draft, immutable revision
 * reference, explicit create modes, expected published version and
 * readiness state consumed by F17/F18 by reference (PC-FR-001..007).
 */

export class PlanCoreValidationError extends Error {
  readonly code = 'invalid_plan_core';

  constructor(message: string) {
    super(message);
    this.name = 'PlanCoreValidationError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function requireUuid(value: unknown, label: string): string {
  if (!isUuid(value)) {
    throw new PlanCoreValidationError(`${label} must be a valid UUID`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new PlanCoreValidationError(
      `${label} must be a non-negative integer`,
    );
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new PlanCoreValidationError(`${label} must be a positive integer`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new PlanCoreValidationError(`${label} must be a string`);
  }
  return value;
}

function checkAllowedKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new PlanCoreValidationError(
        `${label} has an unknown field: ${key}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Plan identity
// ---------------------------------------------------------------------------

export type PlanId = string;

export function normalizePlanId(input: unknown): PlanId {
  return requireUuid(input, 'Plan id');
}

export type RevisionId = string;

export function normalizeRevisionId(input: unknown): RevisionId {
  return requireUuid(input, 'Revision id');
}

// ---------------------------------------------------------------------------
// Readiness state
// ---------------------------------------------------------------------------

export type ReadinessState =
  'draft' | 'ready' | 'ready_to_publish' | 'published';

const READINESS_STATES: readonly ReadinessState[] = [
  'draft',
  'ready',
  'ready_to_publish',
  'published',
];

export function normalizeReadinessState(input: unknown): ReadinessState {
  if (
    typeof input !== 'string' ||
    !READINESS_STATES.includes(input as ReadinessState)
  ) {
    throw new PlanCoreValidationError(
      `Readiness state must be one of: ${READINESS_STATES.join(', ')}`,
    );
  }
  return input as ReadinessState;
}

// ---------------------------------------------------------------------------
// Private draft (never client-visible before publish)
// ---------------------------------------------------------------------------

export type PrivateDraft = {
  planId: PlanId;
  draftId?: RevisionId;
  visibility: 'private';
  content?: unknown;
  revision?: number;
  updatedAt?: string;
};

const PRIVATE_DRAFT_KEYS = [
  'planId',
  'draftId',
  'visibility',
  'content',
  'revision',
  'updatedAt',
] as const;

export function normalizePrivateDraft(input: unknown): PrivateDraft {
  if (!isRecord(input)) {
    throw new PlanCoreValidationError('Private draft must be an object');
  }
  checkAllowedKeys(input, PRIVATE_DRAFT_KEYS, 'Private draft');

  const planId = normalizePlanId(input.planId);

  let draftId: RevisionId | undefined;
  if (input.draftId !== undefined) {
    draftId = normalizeRevisionId(input.draftId);
  }

  if (input.visibility !== 'private') {
    throw new PlanCoreValidationError('Draft visibility must be private');
  }

  let revision: number | undefined;
  if (input.revision !== undefined) {
    revision = requireNonNegativeInteger(input.revision, 'Draft revision');
  }

  let updatedAt: string | undefined;
  if (input.updatedAt !== undefined) {
    updatedAt = requireString(input.updatedAt, 'Draft updatedAt');
  }

  return {
    planId,
    ...(draftId ? { draftId } : {}),
    visibility: 'private',
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(revision !== undefined ? { revision } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

// ---------------------------------------------------------------------------
// Immutable revision reference
// ---------------------------------------------------------------------------

export type ImmutableRevisionRef = {
  planId: PlanId;
  revisionId: RevisionId;
  revisionNumber: number;
  version?: number;
  publishedVersion?: number;
  expectedPublishedVersion?: number;
  authorId: PlanId;
  author?: PlanId;
  createdAt?: string;
  immutable?: true;
};

const IMMUTABLE_REVISION_KEYS = [
  'planId',
  'revisionId',
  'revisionNumber',
  'version',
  'publishedVersion',
  'expectedPublishedVersion',
  'authorId',
  'author',
  'createdAt',
  'immutable',
] as const;

export function normalizeImmutableRevisionRef(
  input: unknown,
): ImmutableRevisionRef {
  if (!isRecord(input)) {
    throw new PlanCoreValidationError(
      'Immutable revision reference must be an object',
    );
  }
  checkAllowedKeys(
    input,
    IMMUTABLE_REVISION_KEYS,
    'Immutable revision reference',
  );

  const planId = normalizePlanId(input.planId);
  const revisionId = normalizeRevisionId(input.revisionId);
  const revisionNumber = requirePositiveInteger(
    input.revisionNumber,
    'Revision number',
  );

  let version: number | undefined;
  if (input.version !== undefined) {
    version = requireNonNegativeInteger(input.version, 'Version');
  }

  let publishedVersion: number | undefined;
  if (input.publishedVersion !== undefined) {
    publishedVersion = requireNonNegativeInteger(
      input.publishedVersion,
      'Published version',
    );
  }

  let expectedPublishedVersion: number | undefined;
  if (input.expectedPublishedVersion !== undefined) {
    expectedPublishedVersion = requireNonNegativeInteger(
      input.expectedPublishedVersion,
      'Expected published version',
    );
  }

  const authorId = normalizePlanId(input.authorId);

  let author: PlanId | undefined;
  if (input.author !== undefined) {
    author = normalizePlanId(input.author);
  }

  let createdAt: string | undefined;
  if (input.createdAt !== undefined) {
    createdAt = requireString(input.createdAt, 'Created at');
  }

  let immutable: true | undefined;
  if (input.immutable !== undefined) {
    if (input.immutable !== true) {
      throw new PlanCoreValidationError('Immutable must be true');
    }
    immutable = true;
  }

  return {
    planId,
    revisionId,
    revisionNumber,
    ...(version !== undefined ? { version } : {}),
    ...(publishedVersion !== undefined ? { publishedVersion } : {}),
    ...(expectedPublishedVersion !== undefined
      ? { expectedPublishedVersion }
      : {}),
    authorId,
    ...(author !== undefined ? { author } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(immutable !== undefined ? { immutable } : {}),
  };
}

// ---------------------------------------------------------------------------
// Expected published version (CAS)
// ---------------------------------------------------------------------------

export type ExpectedPublishedVersion = number;

export function normalizeExpectedPublishedVersion(
  input: unknown,
): ExpectedPublishedVersion {
  return requireNonNegativeInteger(input, 'Expected published version');
}

// ---------------------------------------------------------------------------
// Explicit create modes
// ---------------------------------------------------------------------------

export type CreateMode = 'blank' | 'template' | 'existing_plan';

const CREATE_MODES: readonly CreateMode[] = [
  'blank',
  'template',
  'existing_plan',
];

export function normalizeCreateMode(input: unknown): CreateMode {
  if (
    typeof input !== 'string' ||
    !CREATE_MODES.includes(input as CreateMode)
  ) {
    throw new PlanCoreValidationError(
      `Create mode must be one of: ${CREATE_MODES.join(', ')}`,
    );
  }
  return input as CreateMode;
}

export type CreatePlanInput =
  | { createMode: 'blank' }
  | { createMode: 'template'; templateId: PlanId }
  | { createMode: 'existing_plan'; sourcePlanId: PlanId };

const BLANK_CREATE_KEYS = ['createMode'] as const;
const TEMPLATE_CREATE_KEYS = ['createMode', 'templateId'] as const;
const EXISTING_CREATE_KEYS = ['createMode', 'sourcePlanId'] as const;

export function normalizeCreatePlanInput(input: unknown): CreatePlanInput {
  if (!isRecord(input)) {
    throw new PlanCoreValidationError('Create plan input must be an object');
  }

  const createMode = normalizeCreateMode(input.createMode);

  if (createMode === 'blank') {
    checkAllowedKeys(input, BLANK_CREATE_KEYS, 'Create plan input');
    return { createMode: 'blank' };
  }

  if (createMode === 'template') {
    checkAllowedKeys(input, TEMPLATE_CREATE_KEYS, 'Create plan input');
    const templateId = normalizePlanId(input.templateId);
    return { createMode: 'template', templateId };
  }

  checkAllowedKeys(input, EXISTING_CREATE_KEYS, 'Create plan input');
  const sourcePlanId = normalizePlanId(input.sourcePlanId);
  return { createMode: 'existing_plan', sourcePlanId };
}

// ---------------------------------------------------------------------------
// Plan root / lifecycle
// ---------------------------------------------------------------------------

export type PlanRoot = {
  planId: PlanId;
  draft?: PrivateDraft;
  currentRevision?: ImmutableRevisionRef;
  publishedVersion?: number;
  readiness?: ReadinessState;
};

const PLAN_ROOT_KEYS = [
  'planId',
  'draft',
  'currentRevision',
  'publishedVersion',
  'readiness',
] as const;

export function normalizePlanRoot(input: unknown): PlanRoot {
  if (!isRecord(input)) {
    throw new PlanCoreValidationError('Plan root must be an object');
  }
  checkAllowedKeys(input, PLAN_ROOT_KEYS, 'Plan root');

  const planId = normalizePlanId(input.planId);

  let draft: PrivateDraft | undefined;
  if (input.draft !== undefined) {
    draft = normalizePrivateDraft(input.draft);
  }

  let currentRevision: ImmutableRevisionRef | undefined;
  if (input.currentRevision !== undefined) {
    currentRevision = normalizeImmutableRevisionRef(input.currentRevision);
  }

  let publishedVersion: number | undefined;
  if (input.publishedVersion !== undefined) {
    publishedVersion = requireNonNegativeInteger(
      input.publishedVersion,
      'Published version',
    );
  }

  let readiness: ReadinessState | undefined;
  if (input.readiness !== undefined) {
    readiness = normalizeReadinessState(input.readiness);
  }

  return {
    planId,
    ...(draft !== undefined ? { draft } : {}),
    ...(currentRevision !== undefined ? { currentRevision } : {}),
    ...(publishedVersion !== undefined ? { publishedVersion } : {}),
    ...(readiness !== undefined ? { readiness } : {}),
  };
}

// ---------------------------------------------------------------------------
// Revision transition validation
// ---------------------------------------------------------------------------

export type RevisionTransition = {
  fromVersion: number;
  toVersion: number;
  fromRevisionId?: RevisionId;
  toRevisionId?: RevisionId;
};

const REVISION_TRANSITION_KEYS = [
  'fromVersion',
  'toVersion',
  'fromRevisionId',
  'toRevisionId',
] as const;

export function normalizeRevisionTransition(
  input: unknown,
): RevisionTransition {
  if (!isRecord(input)) {
    throw new PlanCoreValidationError('Revision transition must be an object');
  }
  checkAllowedKeys(input, REVISION_TRANSITION_KEYS, 'Revision transition');

  const fromVersion = requireNonNegativeInteger(
    input.fromVersion,
    'From version',
  );
  const toVersion = requireNonNegativeInteger(input.toVersion, 'To version');

  if (toVersion <= fromVersion) {
    throw new PlanCoreValidationError(
      'revision version must strictly increase',
    );
  }

  let fromRevisionId: RevisionId | undefined;
  if (input.fromRevisionId !== undefined) {
    fromRevisionId = normalizeRevisionId(input.fromRevisionId);
  }

  let toRevisionId: RevisionId | undefined;
  if (input.toRevisionId !== undefined) {
    toRevisionId = normalizeRevisionId(input.toRevisionId);
  }

  return {
    fromVersion,
    toVersion,
    ...(fromRevisionId !== undefined ? { fromRevisionId } : {}),
    ...(toRevisionId !== undefined ? { toRevisionId } : {}),
  };
}

export function isValidRevisionTransition(
  fromVersion: number,
  toVersion: number,
): boolean {
  return (
    Number.isInteger(fromVersion) &&
    Number.isInteger(toVersion) &&
    fromVersion >= 0 &&
    toVersion > fromVersion
  );
}

export function assertRevisionTransition(
  fromVersion: number,
  toVersion: number,
): void {
  if (!isValidRevisionTransition(fromVersion, toVersion)) {
    throw new PlanCoreValidationError('invalid revision transition');
  }
}

// ---------------------------------------------------------------------------
// Append-only revision guard
// ---------------------------------------------------------------------------

export function isRevisionAppendOnly(
  previous: ImmutableRevisionRef,
  next: ImmutableRevisionRef,
): boolean {
  if (previous.planId !== next.planId) return false;
  if (previous.revisionId === next.revisionId) return false;
  if (next.revisionNumber <= previous.revisionNumber) return false;
  return true;
}

export function validateRevisionAppendOnly(
  previous: ImmutableRevisionRef,
  next: ImmutableRevisionRef,
): void {
  if (!isRevisionAppendOnly(previous, next)) {
    throw new PlanCoreValidationError('revision must be append-only');
  }
}
