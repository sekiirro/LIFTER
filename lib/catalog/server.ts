import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authorize, type Actor } from '../auth/authorize';
import type { Role } from '../auth/capabilities';
import { createSessionClient } from '../supabase/server';

type RpcError = { code?: string; message?: string };
type RpcResult<T = unknown> = { data: T | null; error: RpcError | null };
type SessionClient = Pick<SupabaseClient, 'auth' | 'from' | 'rpc'>;
type CatalogStatus =
  'not_permitted' | 'conflict' | 'invalid' | 'limit' | 'unavailable';
export type CatalogResult<T = unknown> =
  { status: 'ok'; data: T } | { status: CatalogStatus };
export type CatalogSearchInput = {
  kind: string;
  query: string;
  filters?: Record<string, unknown> & {
    primary_muscle_code?: string;
    equipment_codes?: string[];
  };
  cursor?: string | null;
  workspaceId?: string | null;
};
export type CatalogMutation = {
  operationKey: string;
  workspaceId?: string;
  id?: string;
  targetId?: string;
  expectedVersion?: number | null;
  transition?: 'remove' | 'restore';
  request?: Record<string, unknown>;
};
export type FoodDuplicateQuery = {
  name: string;
  language: 'ar' | 'en';
  basis: 'g' | 'ml';
  productIdentity: string;
  preparationIdentity: string;
  weighingState: 'raw' | 'cooked' | 'not_applicable';
  kcal: number;
};
export type CatalogWorkspaceOption = { id: string; name: string };
export type CatalogExerciseDetailRow = {
  exercise_id: string;
  version: number;
  payload: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
  origin_workspace_id: string | null;
  name_ar: string;
  name_en: string;
  requested_id: string;
  survivor_id: string;
  lifecycle_state: 'active' | 'removed';
  lifecycle_revision: number;
  variation: { workspace_id: string; video_url: string } | null;
};
export type CatalogAlternativeInput = {
  foodId: string;
  version: number;
  sourcePortion: number;
  alternativePortion: number;
};
export type CatalogFoodMutation = CatalogMutation & {
  alternatives?: CatalogAlternativeInput[];
};
export type CatalogDependencies = {
  session: () => Promise<SessionClient | null>;
  actor: (client: SessionClient) => Promise<Actor | null>;
};

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_BY_DB: Record<string, Role> = {
  platform_owner: 'platform_owner',
  workspace_owner: 'workspace_owner',
  trainer: 'trainer',
  sales: 'sales',
};
const operationNames = {
  createExercise: 'catalog_create_exercise',
  versionExercise: 'catalog_version_exercise',
  transitionExercise: 'catalog_transition_exercise',
  removeWorkspaceExercise: 'catalog_remove_workspace_exercise',
  mergeExercise: 'catalog_merge_exercise',
  writeWorkspaceExercise: 'catalog_write_workspace_exercise',
  writeVariation: 'catalog_write_variation',
  transitionVariation: 'catalog_transition_variation',
  createFood: 'catalog_create_food',
  versionFood: 'catalog_version_food',
  transitionFood: 'catalog_transition_food',
  mergeFood: 'catalog_merge_food',
} as const;

function mapError(error: RpcError): CatalogStatus {
  if (error.code === '42501' || error.code === 'P0002') return 'not_permitted';
  if (
    ['23514', 'P0001'].includes(error.code ?? '') &&
    [
      'catalog_food_creator_limit',
      'catalog_food_platform_limit',
      'catalog_food_active_limit',
    ].includes(error.message ?? '')
  )
    return 'limit';
  if (
    error.code === '40001' ||
    error.code === '23505' ||
    error.code === '23514'
  )
    return 'conflict';
  if (error.code === '22023') return 'invalid';
  return 'unavailable';
}

async function loadSessionActor(client: SessionClient): Promise<Actor | null> {
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user) return null;
  const userId = auth.data.user.id;
  const [staff, memberships] = await Promise.all([
    client
      .from('staff_profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle(),
    client
      .from('workspace_memberships')
      .select('workspace_id, revoked_at')
      .eq('user_id', userId),
  ]);
  if (staff.error || memberships.error) return null;
  const role = staff.data?.role ? (ROLE_BY_DB[staff.data.role] ?? null) : null;
  return {
    userId,
    role,
    activeWorkspaceIds: (memberships.data ?? [])
      .filter((m: { revoked_at: string | null }) => m.revoked_at === null)
      .map((m: { workspace_id: string }) => m.workspace_id),
  };
}

export function createCatalogServer(deps: CatalogDependencies) {
  async function prepare(required: (actor: Actor) => boolean) {
    const client = await deps.session();
    if (!client)
      return {
        result: { status: 'unavailable' } as CatalogResult,
        client: null,
        actor: null,
      };
    const actor = await deps.actor(client);
    if (!actor || !required(actor))
      return {
        result: { status: 'not_permitted' } as CatalogResult,
        client: null,
        actor: null,
      };
    return { result: null, client, actor };
  }
  async function rpc<T>(
    client: SessionClient,
    name: string,
    args: Record<string, unknown>,
  ): Promise<CatalogResult<T>> {
    try {
      const response = (await client.rpc(name, args)) as RpcResult<T>;
      return response.error
        ? { status: mapError(response.error) }
        : { status: 'ok', data: response.data as T };
    } catch {
      return { status: 'unavailable' };
    }
  }
  const isPO = (a: Actor) => a.role === 'platform_owner';
  const coachingSomewhere = (a: Actor) =>
    isPO(a) ||
    (a.role !== null && a.role !== 'sales' && a.activeWorkspaceIds.length > 0);
  const scoped = (a: Actor, workspaceId?: string) =>
    !!workspaceId && !!a.role && authorize(a, 'coaching_work', workspaceId);
  const keyValid = (key: string) => UUID_V4.test(key);
  async function mutate(
    input: CatalogMutation,
    name: string,
    allowed: (a: Actor) => boolean,
    args: (i: CatalogMutation) => Record<string, unknown>,
  ): Promise<CatalogResult> {
    const ready = await prepare(allowed);
    if (ready.result) return ready.result;
    if (!keyValid(input.operationKey)) return { status: 'invalid' };
    return rpc(ready.client!, name, args(input));
  }
  return {
    authoringWorkspaces() {
      return (async (): Promise<CatalogResult<CatalogWorkspaceOption[]>> => {
        const ready = await prepare((a) => isPO(a) || coachingSomewhere(a));
        if (ready.result)
          return { status: ready.result.status } as CatalogResult<
            CatalogWorkspaceOption[]
          >;
        try {
          const response = await ready
            .client!.from('workspaces')
            .select('id,name')
            .order('name');
          if (response.error || !response.data)
            return { status: 'unavailable' };
          const workspaces = response.data.filter(
            (workspace: { id: string }) =>
              isPO(ready.actor!) || scoped(ready.actor!, workspace.id),
          );
          return {
            status: 'ok',
            data: workspaces.map((workspace: { id: string; name: string }) => ({
              id: workspace.id,
              name: workspace.name,
            })),
          };
        } catch {
          return { status: 'unavailable' };
        }
      })();
    },
    foodDuplicateCandidates(input: FoodDuplicateQuery) {
      return (async (): Promise<CatalogResult> => {
        const ready = await prepare(coachingSomewhere);
        if (ready.result) return ready.result;
        return rpc(ready.client!, 'catalog_food_duplicate_candidates', {
          p_name: input.name,
          p_language: input.language,
          p_basis: input.basis,
          p_product_identity: input.productIdentity,
          p_preparation_identity: input.preparationIdentity,
          p_weighing_state: input.weighingState,
          p_kcal: input.kcal,
        });
      })();
    },
    search(input: CatalogSearchInput) {
      return (async (): Promise<CatalogResult> => {
        const ready = await prepare(
          (a) =>
            coachingSomewhere(a) &&
            (!input.workspaceId || scoped(a, input.workspaceId)),
        );
        if (ready.result) return ready.result;
        return rpc(ready.client!, 'catalog_search', {
          kind: input.kind,
          query: input.query,
          filters: input.filters ?? {},
          cursor: input.cursor ?? null,
          workspace_id: input.workspaceId ?? null,
        });
      })();
    },
    exerciseDetail(input: {
      exerciseId: string;
      scope?: 'global' | 'workspace';
      workspaceId?: string | null;
    }) {
      return (async (): Promise<CatalogResult<CatalogExerciseDetailRow[]>> => {
        const workspaceScope = input.scope === 'workspace';
        const ready = await prepare((actor) =>
          workspaceScope
            ? !!input.workspaceId &&
              (isPO(actor) || scoped(actor, input.workspaceId))
            : coachingSomewhere(actor) &&
              (!input.workspaceId ||
                isPO(actor) ||
                scoped(actor, input.workspaceId)),
        );
        if (ready.result)
          return { status: ready.result.status } as CatalogResult<
            CatalogExerciseDetailRow[]
          >;
        return rpc<CatalogExerciseDetailRow[]>(
          ready.client!,
          workspaceScope
            ? 'catalog_workspace_exercise_detail'
            : 'catalog_exercise_detail',
          workspaceScope
            ? {
                p_exercise_id: input.exerciseId,
                p_workspace_id: input.workspaceId,
              }
            : {
                p_exercise_id: input.exerciseId,
                p_workspace_id: input.workspaceId ?? null,
              },
        );
      })();
    },
    createExercise: (i: CatalogMutation) =>
      mutate(i, operationNames.createExercise, isPO, (x) => ({
        p_operation_key: x.operationKey,
        p_request: x.request,
      })),
    versionExercise: (i: CatalogMutation) =>
      mutate(i, operationNames.versionExercise, isPO, (x) => ({
        p_exercise_id: x.id,
        p_expected_version: x.expectedVersion,
        p_operation_key: x.operationKey,
        p_request: x.request,
      })),
    transitionExercise: (i: CatalogMutation) =>
      mutate(i, operationNames.transitionExercise, isPO, (x) => ({
        p_exercise_id: x.id,
        p_expected_revision: x.expectedVersion,
        p_transition: x.transition,
        p_operation_key: x.operationKey,
      })),
    removeWorkspaceExercise: (i: CatalogMutation) =>
      mutate(
        i,
        operationNames.removeWorkspaceExercise,
        (a) => isPO(a) || scoped(a, i.workspaceId),
        (x) => ({
          p_workspace_id: x.workspaceId,
          p_exercise_id: x.id,
          p_expected_revision: x.expectedVersion,
          p_operation_key: x.operationKey,
        }),
      ),
    mergeExercise: (i: CatalogMutation) =>
      mutate(i, operationNames.mergeExercise, isPO, (x) => ({
        p_source_id: x.id,
        p_target_id: x.targetId,
        p_expected_source_revision: x.expectedVersion,
        p_operation_key: x.operationKey,
      })),
    writeWorkspaceExercise: (i: CatalogMutation) =>
      mutate(
        i,
        operationNames.writeWorkspaceExercise,
        (a) => scoped(a, i.workspaceId),
        (x) => ({
          p_workspace_id: x.workspaceId,
          p_exercise_id: x.id ?? null,
          p_expected_version: x.expectedVersion ?? null,
          p_operation_key: x.operationKey,
          p_request: x.request,
        }),
      ),
    writeVariation: (i: CatalogMutation) =>
      mutate(
        i,
        operationNames.writeVariation,
        (a) =>
          typeof i.workspaceId === 'string' &&
          i.workspaceId.trim().length > 0 &&
          (isPO(a) || scoped(a, i.workspaceId)),
        (x) => ({
          p_workspace_id: x.workspaceId,
          p_exercise_id: x.id,
          p_expected_version: x.expectedVersion ?? null,
          p_operation_key: x.operationKey,
          p_request: x.request,
        }),
      ),
    transitionVariation: (i: CatalogMutation) =>
      mutate(
        i,
        operationNames.transitionVariation,
        (a) => scoped(a, i.workspaceId),
        (x) => ({
          p_workspace_id: x.workspaceId,
          p_exercise_id: x.id,
          p_expected_version: x.expectedVersion,
          p_transition: x.transition,
          p_operation_key: x.operationKey,
        }),
      ),
    createFood: (i: CatalogFoodMutation) =>
      mutate(
        i,
        operationNames.createFood,
        (a) => isPO(a) || (!!i.workspaceId && scoped(a, i.workspaceId)),
        (x) => ({
          p_operation_key: x.operationKey,
          p_origin_workspace_id: x.workspaceId ?? null,
          p_request: x.request,
          p_alternatives: (i.alternatives ?? []).map((alternative) => ({
            alternative_food_id: alternative.foodId,
            alternative_version: alternative.version,
            source_portion: alternative.sourcePortion,
            alternative_portion: alternative.alternativePortion,
          })),
        }),
      ),
    versionFood: async (i: CatalogFoodMutation) => {
      const ready = await prepare(
        (a) =>
          isPO(a) ||
          (a.role !== null &&
            a.role !== 'sales' &&
            !!a.activeWorkspaceIds.length),
      );
      if (ready.result) return ready.result;
      if (!keyValid(i.operationKey)) return { status: 'invalid' };
      if (!isPO(ready.actor!) && i.id) {
        try {
          const ownership = (await ready.client!.rpc(
            'catalog_can_version_food',
            { p_food_id: i.id },
          )) as RpcResult<boolean>;
          if (ownership.error) return { status: mapError(ownership.error) };
          if (!ownership.data) return { status: 'not_permitted' };
        } catch {
          return { status: 'unavailable' };
        }
      } else if (!isPO(ready.actor!)) return { status: 'not_permitted' };
      return rpc(ready.client!, operationNames.versionFood, {
        p_food_id: i.id,
        p_expected_version: i.expectedVersion,
        p_operation_key: i.operationKey,
        p_request: i.request,
        p_alternatives: (i.alternatives ?? []).map((alternative) => ({
          alternative_food_id: alternative.foodId,
          alternative_version: alternative.version,
          source_portion: alternative.sourcePortion,
          alternative_portion: alternative.alternativePortion,
        })),
      });
    },
    transitionFood: (i: CatalogMutation) =>
      mutate(i, operationNames.transitionFood, isPO, (x) => ({
        p_food_id: x.id,
        p_expected_revision: x.expectedVersion,
        p_transition: x.transition,
        p_operation_key: x.operationKey,
      })),
    mergeFood: (i: CatalogMutation) =>
      mutate(i, operationNames.mergeFood, isPO, (x) => ({
        p_source_id: x.id,
        p_target_id: x.targetId,
        p_expected_source_revision: x.expectedVersion,
        p_operation_key: x.operationKey,
      })),
  };
}

const catalog = createCatalogServer({
  session: createSessionClient,
  actor: loadSessionActor,
});
export const {
  authoringWorkspaces,
  foodDuplicateCandidates,
  search,
  exerciseDetail,
  createExercise,
  versionExercise,
  transitionExercise,
  removeWorkspaceExercise,
  mergeExercise,
  writeWorkspaceExercise,
  writeVariation,
  transitionVariation,
  createFood,
  versionFood,
  transitionFood,
  mergeFood,
} = catalog;
