import type { ExerciseSnapshotV2 } from '../catalog/snapshot';
import type { NutritionDocumentV1 } from './nutrition/types';

/** The client may select a client and source, but workspace and actor come from auth. */
type CreatePlanRequestBase = {
  clientId: string;
  kind: PlanKind;
  operationKey: string;
};

export type CreatePlanRequest =
  | (CreatePlanRequestBase & {
      createMode: 'blank';
      templateId?: never;
      sourcePlanId?: never;
    })
  | (CreatePlanRequestBase & {
      createMode: 'template';
      templateId: string;
      sourcePlanId?: never;
    })
  | (CreatePlanRequestBase & {
      createMode: 'existing_plan';
      sourcePlanId: string;
      templateId?: never;
    });

export type PlanKind = 'workout' | 'nutrition';

/**
 * F17/F18 own document schemas. The shared boundary preserves the kind and
 * schema version while their validators own full shape validation. Workout
 * documents use F16 ExerciseSnapshotV2 references; nutrition documents use
 * immutable F16 foodId/foodVersion references. Video is resolved live.
 */
export type PlanContent<TDocument = unknown> = {
  kind: PlanKind;
  schemaVersion: number;
  document: TDocument;
};

/** Named F16 reference for workout domain validators and planner consumers. */
export type PlanExerciseSnapshot = ExerciseSnapshotV2;
/** Named F16 reference for nutrition domain validators and planner consumers. */
export type PlanFoodDocument = NutritionDocumentV1;

export type DraftWriteRequest = {
  planId: string;
  expectedDraftVersion: number;
  content: PlanContent;
  operationKey: string;
  intent: 'autosave' | 'save_draft';
};

export type ReadyAndPublishRequest = {
  planId: string;
  expectedDraftVersion: number;
  expectedPublishedRevision: number;
  operationKey: string;
};

export type PlanOperationError =
  | { status: 'not_permitted' }
  | { status: 'invalid_input' }
  | { status: 'stale_version' }
  | { status: 'key_conflict' }
  | { status: 'unavailable' };

export type PlanOperationResult<TReceipt> =
  { status: 'ok'; replayed: boolean; receipt: TReceipt } | PlanOperationError;

export type CreatePlanReceipt = { planId: string };
export type DraftWriteReceipt = { planId: string; draftVersion: number };
export type ReadyAndPublishReceipt = {
  planId: string;
  revisionId: string;
  revisionNumber: number;
};

type RpcErrorShape = { code?: unknown; message?: unknown };

/** Convert the F19 RPC's closed SQL errors to the shared client contract. */
export function mapPlanRpcError(error: unknown): PlanOperationError {
  if (!error || typeof error !== 'object') return { status: 'unavailable' };
  const { code, message } = error as RpcErrorShape;
  if (code === '42501') return { status: 'not_permitted' };
  if (code === '22023' && message === 'invalid_input')
    return { status: 'invalid_input' };
  if (code === '40001' && message === 'stale_version')
    return { status: 'stale_version' };
  if (code === '23505' && message === 'key_conflict')
    return { status: 'key_conflict' };
  return { status: 'unavailable' };
}
