import { z } from 'zod';

/**
 * Shared Plan Core (F19) lifecycle schemas.
 *
 * Pure TypeScript contracts only: no database, auth, or RLS concerns.
 * These freeze the stable Plan ID, private draft, immutable revision
 * reference, explicit create modes, expected published version and
 * readiness state consumed by F17/F18 by reference (PC-FR-001..007).
 */

// ---------------------------------------------------------------------------
// Plan identity
// ---------------------------------------------------------------------------

export const PlanIdSchema = z.string().uuid();
export const planIdSchema = PlanIdSchema;
export type PlanId = z.infer<typeof PlanIdSchema>;

export const PlanIdInputSchema = PlanIdSchema;
export const planIdInputSchema = PlanIdSchema;

// ---------------------------------------------------------------------------
// Readiness state
// ---------------------------------------------------------------------------

export const ReadinessStateSchema = z.enum([
  'draft',
  'ready',
  'ready_to_publish',
  'published',
]);
export const readinessStateSchema = ReadinessStateSchema;
export const PlanReadinessSchema = ReadinessStateSchema;
export const planReadinessSchema = ReadinessStateSchema;
export type ReadinessState = z.infer<typeof ReadinessStateSchema>;

// ---------------------------------------------------------------------------
// Private draft (never client-visible before publish)
// ---------------------------------------------------------------------------

export const PrivateDraftSchema = z
  .object({
    planId: PlanIdSchema,
    draftId: z.string().uuid().optional(),
    visibility: z.literal('private'),
    content: z.unknown().optional(),
    revision: z.number().int().nonnegative().optional(),
    updatedAt: z.string().optional(),
  })
  .strict();
export const privateDraftSchema = PrivateDraftSchema;
export const DraftSchema = PrivateDraftSchema;
export const draftSchema = PrivateDraftSchema;
export type PrivateDraft = z.infer<typeof PrivateDraftSchema>;

// ---------------------------------------------------------------------------
// Immutable revision reference
// ---------------------------------------------------------------------------

export const RevisionIdSchema = z.string().uuid();
export const revisionIdSchema = RevisionIdSchema;

export const ImmutableRevisionRefSchema = z
  .object({
    planId: PlanIdSchema,
    revisionId: RevisionIdSchema,
    revisionNumber: z.number().int().positive(),
    version: z.number().int().nonnegative().optional(),
    publishedVersion: z.number().int().nonnegative().optional(),
    expectedPublishedVersion: z.number().int().nonnegative().optional(),
    authorId: z.string().uuid().optional(),
    author: z.string().uuid().optional(),
    createdAt: z.string().optional(),
    immutable: z.literal(true).optional(),
  })
  .strict();
export const immutableRevisionRefSchema = ImmutableRevisionRefSchema;
export const RevisionRefSchema = ImmutableRevisionRefSchema;
export const revisionRefSchema = ImmutableRevisionRefSchema;
export const RevisionReferenceSchema = ImmutableRevisionRefSchema;
export const revisionReferenceSchema = ImmutableRevisionRefSchema;
export const PublishedRevisionSchema = ImmutableRevisionRefSchema;
export const publishedRevisionSchema = ImmutableRevisionRefSchema;
export type ImmutableRevisionRef = z.infer<typeof ImmutableRevisionRefSchema>;

// ---------------------------------------------------------------------------
// Expected published version (CAS)
// ---------------------------------------------------------------------------

export const ExpectedPublishedVersionSchema = z.number().int().nonnegative();
export const expectedPublishedVersionSchema = ExpectedPublishedVersionSchema;
export const ExpectedVersionSchema = ExpectedPublishedVersionSchema;
export const expectedVersionSchema = ExpectedPublishedVersionSchema;

// ---------------------------------------------------------------------------
// Explicit create modes
// ---------------------------------------------------------------------------

export const CreateModeSchema = z.enum([
  'blank',
  'template',
  'existing',
  'from_blank',
  'from_template',
  'from_existing',
  'from_existing_plan',
  'fromExistingPlan',
]);
export const createModeSchema = CreateModeSchema;
export const CreateMode = CreateModeSchema;

export const CreatePlanInputSchema = z
  .object({
    createMode: CreateModeSchema.optional(),
    mode: CreateModeSchema.optional(),
    createNewPlan: z.boolean().optional(),
    newPlan: z.boolean().optional(),
    explicitCreate: z.boolean().optional(),
    explicit: z.boolean().optional(),
    planId: PlanIdSchema.optional(),
    sourcePlanId: PlanIdSchema.optional(),
    templateId: z.string().optional(),
    expectedPublishedVersion: ExpectedPublishedVersionSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.createMode !== undefined ||
      value.mode !== undefined ||
      value.createNewPlan === true ||
      value.newPlan === true ||
      value.explicitCreate === true ||
      value.explicit === true,
    { message: 'explicit create discriminator is required' },
  );
export const createPlanInputSchema = CreatePlanInputSchema;
export const CreateNewPlanSchema = CreatePlanInputSchema;
export const createNewPlanSchema = CreatePlanInputSchema;
export const CreatePlanSchema = CreatePlanInputSchema;
export const createPlanSchema = CreatePlanInputSchema;
export const ExplicitCreateSchema = CreatePlanInputSchema;
export const explicitCreateSchema = CreatePlanInputSchema;

// ---------------------------------------------------------------------------
// Plan root / lifecycle
// ---------------------------------------------------------------------------

export const PlanRootSchema = z
  .object({
    planId: PlanIdSchema,
    draft: PrivateDraftSchema.optional(),
    currentRevision: ImmutableRevisionRefSchema.optional(),
    publishedVersion: ExpectedPublishedVersionSchema.optional(),
    readiness: ReadinessStateSchema.optional(),
  })
  .strict();
export const planRootSchema = PlanRootSchema;
export const PlanSchema = PlanRootSchema;
export const planSchema = PlanRootSchema;
export const PlanLifecycleSchema = PlanRootSchema;
export const planLifecycleSchema = PlanRootSchema;

// ---------------------------------------------------------------------------
// Revision transition validation
// ---------------------------------------------------------------------------

export const RevisionTransitionSchema = z
  .object({
    fromVersion: z.number().int().nonnegative(),
    toVersion: z.number().int().nonnegative(),
    fromRevisionId: RevisionIdSchema.optional(),
    toRevisionId: RevisionIdSchema.optional(),
  })
  .strict()
  .refine((value) => value.toVersion > value.fromVersion, {
    message: 'revision version must strictly increase',
  });
export const revisionTransitionSchema = RevisionTransitionSchema;

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
    throw new Error('invalid revision transition');
  }
}

// ---------------------------------------------------------------------------
// Append-only revision guard (mutation target)
// ---------------------------------------------------------------------------

export const ALLOW_IN_PLACE_REVISION_MUTATION = false;

export function isRevisionAppendOnly(
  previous: ImmutableRevisionRef,
  next: ImmutableRevisionRef,
): boolean {
  if (ALLOW_IN_PLACE_REVISION_MUTATION) return true;
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
    throw new Error('revision must be append-only');
  }
}

// ---------------------------------------------------------------------------
// Parse helpers (null on failure, mirroring lib validation style)
// ---------------------------------------------------------------------------

function safe<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

export function parsePlanId(value: unknown): PlanId | null {
  return safe(PlanIdSchema, value);
}

export function parsePrivateDraft(value: unknown): PrivateDraft | null {
  return safe(PrivateDraftSchema, value);
}

export function parseImmutableRevisionRef(
  value: unknown,
): ImmutableRevisionRef | null {
  return safe(ImmutableRevisionRefSchema, value);
}

export function parseCreatePlanInput(
  value: unknown,
): z.infer<typeof CreatePlanInputSchema> | null {
  return safe(CreatePlanInputSchema, value);
}

export function parseReadinessState(value: unknown): ReadinessState | null {
  return safe(ReadinessStateSchema, value);
}

// ---------------------------------------------------------------------------
// Aggregate export
// ---------------------------------------------------------------------------

export const planCoreSchemas = {
  PlanIdSchema,
  planIdSchema,
  PrivateDraftSchema,
  privateDraftSchema,
  DraftSchema,
  draftSchema,
  ImmutableRevisionRefSchema,
  immutableRevisionRefSchema,
  RevisionRefSchema,
  revisionRefSchema,
  RevisionReferenceSchema,
  revisionReferenceSchema,
  PublishedRevisionSchema,
  publishedRevisionSchema,
  ExpectedPublishedVersionSchema,
  expectedPublishedVersionSchema,
  ExpectedVersionSchema,
  expectedVersionSchema,
  CreateModeSchema,
  createModeSchema,
  CreatePlanInputSchema,
  createPlanInputSchema,
  CreateNewPlanSchema,
  createNewPlanSchema,
  CreatePlanSchema,
  createPlanSchema,
  ExplicitCreateSchema,
  explicitCreateSchema,
  PlanRootSchema,
  planRootSchema,
  PlanSchema,
  planSchema,
  PlanLifecycleSchema,
  planLifecycleSchema,
  ReadinessStateSchema,
  readinessStateSchema,
  PlanReadinessSchema,
  planReadinessSchema,
  RevisionTransitionSchema,
  revisionTransitionSchema,
  RevisionIdSchema,
  revisionIdSchema,
};

export default planCoreSchemas;
