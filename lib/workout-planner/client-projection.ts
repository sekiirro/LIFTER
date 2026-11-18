// F16/F17 client-safe workout projection (F22 T017/T023-T028; FR-004, FR-006,
// FR-008, FR-010; F16 FR-029, F16-MCQ-9).
//
// The database boundary `client_portal_workout_plan` derives the client from
// the signed identity, applies fresh F13 entitlement and returns ONE own
// delivered published workout revision: an allowlisted F17 document plus the
// name and current authorized video of every exercise it references. This
// module is the app-layer wall. It accepts only the closed result shape, never
// takes a client, workspace or entitlement from the caller, and builds the
// existing render-neutral `WorkoutExportPayload`, so the F17 print view
// (`WorkoutPrintView`), Excel writer (`buildWorkoutWorkbook`) and formula
// guards render the revision unchanged. There is no second renderer.
//
// The staff reader (`export-reader.ts`) and its coaching_work checks are
// untouched; this is the separate client-safe reader.

import type { Locale } from '../design/preferences';
import { getMessages } from '../i18n';
import {
  parseWorkoutDocumentV1,
  parseWorkoutReference,
  type WorkoutDocumentV1,
  type WorkoutExerciseReference,
} from './document';
import {
  buildWorkoutExportPayload,
  type WorkoutExportPayload,
} from './export-payload';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** One referenced exercise: the ONLY catalog data a client ever receives. */
export type ClientWorkoutExercise = {
  reference: WorkoutExerciseReference;
  name: string;
  videoUrl?: string;
};

export type ClientWorkoutSubscription = {
  status: string;
  effectiveEndExclusive: string | null;
  refundScope?: 'full' | 'partial';
};

export type ClientWorkoutProjection = {
  plan: {
    planId: string;
    workspaceId: string;
    revisionId: string;
    revisionNumber: number;
    publishedAt: string;
  };
  document: WorkoutDocumentV1;
  exercises: ClientWorkoutExercise[];
};

export type ClientWorkoutPlan =
  | {
      status: 'ok';
      subscription: ClientWorkoutSubscription;
      projection: ClientWorkoutProjection;
    }
  | { status: 'restricted'; subscription: ClientWorkoutSubscription }
  | { status: 'not_found' }
  | { status: 'denied' };

export type ClientWorkoutRpc = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseSubscription(raw: unknown): ClientWorkoutSubscription | null {
  if (
    !isRecord(raw) ||
    !exactKeys(raw, ['status', 'effective_end_exclusive', 'refund_scope'])
  )
    return null;
  if (
    raw.refund_scope !== undefined &&
    raw.refund_scope !== 'full' &&
    raw.refund_scope !== 'partial'
  )
    return null;
  if (typeof raw.status !== 'string' || raw.status === '') return null;
  const end = raw.effective_end_exclusive;
  if (end !== null && end !== undefined && typeof end !== 'string') return null;
  return {
    status: raw.status,
    effectiveEndExclusive: end ?? null,
    ...(raw.refund_scope === undefined
      ? {}
      : { refundScope: raw.refund_scope }),
  };
}

/** Same identity the F17 payload builder resolves a reference by. */
export function workoutReferenceKey(
  reference: Pick<
    WorkoutExerciseReference,
    'source' | 'workspace_id' | 'identity_id' | 'overrideWorkspaceId'
  >,
): string {
  return `${reference.source}:${reference.workspace_id ?? ''}:${reference.identity_id}:${reference.overrideWorkspaceId ?? ''}`;
}

function documentReferences(
  document: WorkoutDocumentV1,
): WorkoutExerciseReference[] {
  const out: WorkoutExerciseReference[] = [];
  for (const day of document.days) {
    if (day.kind !== 'session') continue;
    for (const item of day.items) {
      const values = item as Record<string, unknown>;
      out.push(parseWorkoutReference(values.exercise));
      const alternatives = Array.isArray(values.alternatives)
        ? values.alternatives
        : [];
      for (const alternative of alternatives)
        out.push(parseWorkoutReference(alternative));
    }
  }
  return out;
}

const EXERCISE_KEYS = [
  'source',
  'identity_id',
  'workspace_id',
  'overrideWorkspaceId',
  'name',
  'video_url',
] as const;

function parseExercise(raw: unknown): ClientWorkoutExercise | null {
  // Closed shape: any extra (staff-only or private catalog) field denies,
  // including a supplied version or overrideVersion (stamped below).
  if (!isRecord(raw) || !exactKeys(raw, EXERCISE_KEYS)) return null;
  if (typeof raw.name !== 'string' || raw.name === '') return null;
  if (
    raw.video_url !== undefined &&
    (typeof raw.video_url !== 'string' || raw.video_url === '')
  )
    return null;
  const { name, video_url: videoUrl, ...rest } = raw;
  const reference = parseWorkoutReference({
    ...rest,
    version: 1,
    ...(rest.overrideWorkspaceId === undefined ? {} : { overrideVersion: 1 }),
  });
  return {
    reference,
    name: name as string,
    ...(typeof videoUrl === 'string' ? { videoUrl } : {}),
  };
}

/**
 * Parse the closed result of `client_portal_workout_plan`. Every shape or
 * identity mismatch is `denied`; the caller never learns why.
 */
export function projectClientWorkoutPlan(
  raw: unknown,
  requested: { planId: string; revisionNumber: number | null },
): ClientWorkoutPlan {
  if (!isRecord(raw)) return { status: 'denied' };
  if (raw.status === 'not_found') return { status: 'not_found' };
  const subscription = parseSubscription(raw.subscription);
  if (!subscription) return { status: 'denied' };
  // Only an explicit F13 `active` state may accompany plan content.
  if (raw.status === 'restricted' || subscription.status !== 'active')
    return raw.status === 'restricted' || raw.status === 'ok'
      ? { status: 'restricted', subscription }
      : { status: 'denied' };
  if (
    raw.status !== 'ok' ||
    !exactKeys(raw, ['status', 'subscription', 'plan', 'document', 'exercises'])
  )
    return { status: 'denied' };
  const plan = raw.plan;
  if (
    !isRecord(plan) ||
    !exactKeys(plan, [
      'plan_id',
      'workspace_id',
      'revision_id',
      'revision_number',
      'published_at',
    ]) ||
    plan.plan_id !== requested.planId ||
    typeof plan.workspace_id !== 'string' ||
    !UUID.test(plan.workspace_id) ||
    typeof plan.revision_id !== 'string' ||
    !UUID.test(plan.revision_id) ||
    typeof plan.revision_number !== 'number' ||
    !Number.isSafeInteger(plan.revision_number) ||
    plan.revision_number < 1 ||
    (requested.revisionNumber !== null &&
      plan.revision_number !== requested.revisionNumber) ||
    typeof plan.published_at !== 'string' ||
    !Array.isArray(raw.exercises)
  )
    return { status: 'denied' };
  try {
    const document = parseWorkoutDocumentV1(raw.document);
    const exercises = raw.exercises.map(parseExercise);
    if (exercises.some((exercise) => exercise === null))
      return { status: 'denied' };
    const resolved = exercises as ClientWorkoutExercise[];
    const known = new Set(
      resolved.map((exercise) => workoutReferenceKey(exercise.reference)),
    );
    // Whole-call rule (F16 FR-029): every referenced exercise must resolve.
    if (
      documentReferences(document).some(
        (reference) => !known.has(workoutReferenceKey(reference)),
      )
    )
      return { status: 'denied' };
    return {
      status: 'ok',
      subscription,
      projection: {
        plan: {
          planId: plan.plan_id,
          workspaceId: plan.workspace_id,
          revisionId: plan.revision_id,
          revisionNumber: plan.revision_number,
          publishedAt: plan.published_at,
        },
        document,
        exercises: resolved,
      },
    };
  } catch {
    return { status: 'denied' };
  }
}

/**
 * Read the caller's own delivered workout revision. The plan id and optional
 * published revision number are selectors only: the client, workspace and
 * entitlement come from the database session identity.
 */
export async function loadClientWorkoutPlan(
  client: ClientWorkoutRpc,
  planId: string,
  revisionNumber: number | null,
): Promise<ClientWorkoutPlan> {
  if (!UUID.test(planId)) return { status: 'not_found' };
  if (
    revisionNumber !== null &&
    (!Number.isSafeInteger(revisionNumber) || revisionNumber < 1)
  )
    return { status: 'not_found' };
  try {
    const { data, error } = await client.rpc('client_portal_workout_plan', {
      p_plan_id: planId,
      p_revision_number: revisionNumber,
    });
    if (error) return { status: 'denied' };
    return projectClientWorkoutPlan(data, { planId, revisionNumber });
  } catch {
    return { status: 'denied' };
  }
}

/**
 * Build the shared F17 export payload for the print view and Excel writer.
 * Exercise names and live videos come only from the projection; the document
 * text is the allowlisted revision content.
 */
export function buildClientWorkoutPayload(
  projection: ClientWorkoutProjection,
  locale: Locale,
): WorkoutExportPayload {
  const resolved = new Map(
    projection.exercises.map((exercise) => [
      workoutReferenceKey(exercise.reference),
      {
        name: exercise.name,
        ...(exercise.videoUrl === undefined
          ? {}
          : { videoUrl: exercise.videoUrl }),
      },
    ]),
  );
  return buildWorkoutExportPayload({
    plan: {
      title: getMessages(locale)['workout.export.plan'],
      identity: String(projection.plan.revisionNumber),
    },
    document: projection.document,
    library: {
      resolve: (reference) =>
        resolved.get(workoutReferenceKey(reference)) ?? null,
    },
  });
}
