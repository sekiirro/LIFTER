import { NextResponse } from 'next/server';
import { authorize } from '../../../../lib/auth/authorize';
import { loadActorRows } from '../../../../lib/auth/actor';
import {
  buildAiPrompt,
  containsProhibitedInstruction,
} from '../../../../lib/workout-planner/ai-prompt';
import { buildWorkoutExportPayload } from '../../../../lib/workout-planner/export-payload';
import { currentWorkoutVideo } from '../../../../lib/workout-planner/live-video';
import { formatWorkoutPromptContent } from '../../../../lib/workout-planner/copy-prompt';
import {
  parseWorkoutDocumentV1,
  parseWorkoutReference,
  type WorkoutExerciseReference,
  type WorkoutDocumentV1,
} from '../../../../lib/workout-planner/document';
import { createSessionClient } from '../../../../lib/supabase/server';
import type { Locale } from '../../../../lib/design/preferences';
import { roleHasCapability } from '../../../../lib/auth/capabilities';
import { getMessages } from '../../../../lib/i18n';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const denied = () =>
  NextResponse.json({ status: 'unavailable' }, { status: 404 });

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const revisionId = url.searchParams.get('revision');
  const localeValue = url.searchParams.get('locale');
  if (
    !revisionId ||
    !UUID.test(revisionId) ||
    (localeValue !== 'en' && localeValue !== 'ar')
  )
    return denied();
  const locale: Locale = localeValue;

  const client = await createSessionClient();
  if (!client) return denied();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return denied();
  const actor = await loadActorRows(client, authData.user.id);
  // Deny Sales and unaffiliated users before loading any revision content.
  if (!actor?.role || !roleHasCapability(actor.role, 'coaching_work'))
    return denied();

  const selected = await client
    .from('plan_revisions')
    .select('id,workspace_id,plan_id,revision_number,plan_kind,content')
    .eq('id', revisionId)
    .eq('plan_kind', 'workout')
    .maybeSingle();
  const revision = selected.data;
  if (
    selected.error ||
    !revision ||
    !authorize(actor, 'coaching_work', revision.workspace_id)
  )
    return denied();

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
        )
          return null;
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
        )
          return null;
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
    if (details.some((detail) => detail === null)) return denied();
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
    const prompt = buildAiPrompt(
      locale,
      formatWorkoutPromptContent(payload, locale),
    );
    if (containsProhibitedInstruction(prompt)) return denied();
    return NextResponse.json(
      { status: 'ok', prompt },
      { headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } },
    );
  } catch {
    // Invalid/missing foreign references never fall back to client-supplied data.
    return denied();
  }
}
