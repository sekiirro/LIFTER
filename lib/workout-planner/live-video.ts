import type { WorkoutExerciseReference } from './document';

type CurrentWorkoutDetail = {
  variation?: { video_url?: unknown } | null;
  payload?: { video_url?: unknown } | null;
};

/** Read Video from F16's authorized current detail projection, never a revision. */
export function currentWorkoutVideo(
  reference: WorkoutExerciseReference,
  detail: CurrentWorkoutDetail,
): string | undefined {
  const value =
    reference.source === 'global'
      ? detail.variation?.video_url
      : detail.payload?.video_url;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
