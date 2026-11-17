// F17 authorized published-revision export reader (T037; FR-017, FR-018; S60-R18 / S60-D2).
//
// Reads one explicitly selected published revision using a Supabase session client
// under existing RLS. Maps the revision to `WorkoutExportPayload` with live-resolved
// library exercise names and video links.
//
// Shared by the PDF print route, Copy AI Prompt (T040), and browser exports.

import type { SupabaseClient } from '@supabase/supabase-js';
import { authorize, type Actor } from '../auth/authorize';
import { loadActorRows } from '../auth/actor';
import { roleHasCapability } from '../auth/capabilities';
import { createSessionClient } from '../supabase/server';
import { getMessages } from '../i18n';
import type { Locale } from '../design/preferences';
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
import { currentWorkoutVideo } from './live-video';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CatalogRpc = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: unknown;
  }>;
};

type CatalogDetail = {
  variation?: { video_url?: unknown } | null;
  payload?: { video_url?: unknown; name_en?: unknown } | null;
};

function references(document: WorkoutDocumentV1): WorkoutExerciseReference[] {
  const unique = new Map<string, WorkoutExerciseReference>();
  for (const day of document.days) {
    if (day.kind !== 'session') continue;
    for (const item of day.items) {
      const itemValues = item as Record<string, unknown>;
      const alternatives = Array.isArray(itemValues.alternatives)
        ? itemValues.alternatives
        : [];
      for (const reference of [
        parseWorkoutReference(itemValues.exercise),
        ...alternatives.map(parseWorkoutReference),
      ]) {
        const key = `${reference.source}:${reference.workspace_id ?? ''}:${reference.identity_id}:${reference.overrideWorkspaceId ?? ''}`;
        unique.set(key, reference);
      }
    }
  }
  return [...unique.values()];
}

export type AuthorizedWorkoutRevision = {
  id: string;
  workspace_id: string;
  plan_id: string;
  revision_number: number;
  plan_kind: string;
  content: unknown;
};

export type LoadAuthorizedWorkoutExportResult =
  | {
      ok: true;
      payload: WorkoutExportPayload;
      revision: AuthorizedWorkoutRevision;
      actor: Actor;
    }
  | { ok: false; status: 404 };

export type LoadAuthorizedWorkoutExportOptions = {
  revisionId: string;
  locale: Locale;
  client?: SupabaseClient;
  actor?: Actor;
};

export async function loadAuthorizedWorkoutExportPayload(
  options: LoadAuthorizedWorkoutExportOptions,
): Promise<LoadAuthorizedWorkoutExportResult> {
  const { revisionId, locale } = options;
  if (
    !revisionId ||
    !UUID_REGEX.test(revisionId) ||
    (locale !== 'en' && locale !== 'ar')
  ) {
    return { ok: false, status: 404 };
  }

  const client = options.client ?? (await createSessionClient());
  if (!client) return { ok: false, status: 404 };

  let actor = options.actor;
  if (!actor) {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return { ok: false, status: 404 };
    const loadedActor = await loadActorRows(client, authData.user.id);
    if (!loadedActor) return { ok: false, status: 404 };
    actor = loadedActor;
  }

  // Deny Sales and unaffiliated users before loading any revision content.
  if (!actor.role || !roleHasCapability(actor.role, 'coaching_work')) {
    return { ok: false, status: 404 };
  }

  // Published-only enforcement (FR-017, T037): exports resolve ONE explicitly
  // selected row from the immutable published revisions ledger
  // (public.plan_revisions). Unpublished drafts live in public.plan_drafts and
  // are NEVER consulted by this module — no draft lookup, no draft fallback.
  // Weakening this restriction (e.g. falling back to plan_drafts) leaks drafts
  // and must fail the "denies unpublished draft" integration test.
  const selected = await client
    .from('plan_revisions')
    .select('id,workspace_id,plan_id,revision_number,plan_kind,content')
    .eq('id', revisionId)
    .eq('plan_kind', 'workout')
    .maybeSingle();

  const revision = selected.data as AuthorizedWorkoutRevision | null;
  if (
    selected.error ||
    !revision ||
    !authorize(actor, 'coaching_work', revision.workspace_id)
  ) {
    return { ok: false, status: 404 };
  }

  try {
    const document = parseWorkoutDocumentV1(revision.content);
    const rpc = client as unknown as CatalogRpc;
    const resolved = new Map<string, { name: string; videoUrl?: string }>();
    const refs = references(document);
    const details = await Promise.all(
      refs.map(async (reference) => {
        if (
          reference.source === 'workspace_private' &&
          reference.workspace_id !== revision.workspace_id
        ) {
          return null;
        }
        const libraryWorkspaceId =
          reference.source === 'global'
            ? (reference.overrideWorkspaceId ?? revision.workspace_id)
            : revision.workspace_id;
        if (!authorize(actor, 'coaching_work', libraryWorkspaceId)) return null;
        const result =
          reference.source === 'global'
            ? await rpc.rpc('catalog_exercise_detail', {
                p_exercise_id: reference.identity_id,
                p_workspace_id: libraryWorkspaceId,
              })
            : await rpc.rpc('catalog_workspace_exercise_detail', {
                p_workspace_id: revision.workspace_id,
                p_exercise_id: reference.identity_id,
              });
        if (
          result.error ||
          !Array.isArray(result.data) ||
          result.data.length !== 1
        ) {
          return null;
        }
        const detail = result.data[0] as CatalogDetail;
        const name = detail.payload?.name_en;
        if (typeof name !== 'string' || !name) return null;
        const videoUrl = currentWorkoutVideo(reference, detail);
        return {
          reference,
          value: {
            name,
            ...(videoUrl === undefined ? {} : { videoUrl }),
          },
        };
      }),
    );
    if (details.some((detail) => detail === null)) {
      return { ok: false, status: 404 };
    }
    details.forEach((detail) => {
      if (!detail) return;
      const ref = detail.reference;
      resolved.set(
        `${ref.source}:${ref.workspace_id ?? ''}:${ref.identity_id}:${ref.overrideWorkspaceId ?? ''}`,
        detail.value,
      );
    });

    const payload = buildWorkoutExportPayload({
      plan: {
        title: getMessages(locale)['workout.export.plan'],
        identity: String(revision.revision_number),
      },
      document,
      library: {
        resolve(reference) {
          return (
            resolved.get(
              `${reference.source}:${reference.workspace_id ?? ''}:${reference.identity_id}:${reference.overrideWorkspaceId ?? ''}`,
            ) ?? null
          );
        },
      },
    });

    return {
      ok: true,
      payload,
      revision,
      actor,
    };
  } catch {
    // Invalid/missing foreign references never fall back to client-supplied data.
    return { ok: false, status: 404 };
  }
}
