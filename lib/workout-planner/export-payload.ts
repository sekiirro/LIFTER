// F17 render-neutral export payload (T038; FR-017, FR-018, SC-008).
//
// One authorized payload feeds the PDF, Excel and Copy AI Prompt outputs.
// Coach-authored text is carried unchanged, exercise names stay English, and
// Video URLs are resolved live through the caller's authorized library at
// export time: no URL is read from the frozen revision snapshot (SC-011).

import {
  parseWorkoutDocumentV1,
  type WorkoutExerciseReference,
} from './document';

export type WorkoutExportLoad =
  | { mode: 'bodyweight' }
  | { mode: 'added_weight' | 'assisted'; value: string; unit: 'kg' | 'lb' };

export type WorkoutExportSet = {
  type: 'warmup' | 'working';
  load: WorkoutExportLoad;
};

export type WorkoutExportAlternative = {
  name: string;
  videoUrl?: string;
};

export type WorkoutExportReps =
  { value: number } | { min: number; max: number };

export type WorkoutExportItem = {
  name: string;
  description?: string;
  reps?: WorkoutExportReps;
  restSec?: number;
  rir?: number;
  notes?: string;
  alternatives: WorkoutExportAlternative[];
  videoUrl?: string;
  sets: WorkoutExportSet[];
};

export type WorkoutExportDay = {
  kind: 'session' | 'rest';
  title?: string;
  notes?: string;
  items: WorkoutExportItem[];
};

export type WorkoutExportPayload = {
  planTitle: string;
  planIdentity: string;
  planNotes?: string;
  documentNotes?: string;
  days: WorkoutExportDay[];
};

/** Current authorized library projection; `null` means the target is unavailable. */
export type WorkoutExportLibrary = {
  resolve(
    reference: WorkoutExerciseReference,
  ): { name: string; videoUrl?: string | null } | null;
};

export type BuildWorkoutExportPayloadInput = {
  plan: { title: string; identity: string; notes?: string };
  document: unknown;
  library: WorkoutExportLibrary;
};

function invalid(): never {
  throw new Error('invalid_document');
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) return invalid();
  return value;
}

function liveVideo(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function resolvedAlternative(
  reference: WorkoutExerciseReference,
  library: WorkoutExportLibrary,
): WorkoutExportAlternative | null {
  const resolved = library.resolve(reference);
  if (!resolved || typeof resolved.name !== 'string' || !resolved.name)
    return null;
  const videoUrl = liveVideo(resolved.videoUrl);
  return {
    name: resolved.name,
    ...(videoUrl === undefined ? {} : { videoUrl }),
  };
}

/** Item shape guaranteed by `parseWorkoutDocumentV1` (FR-018 fields only). */
type DocumentItem = {
  name: string;
  description?: string;
  reps?: WorkoutExportReps;
  restSec?: number;
  rir?: number;
  notes?: string;
  alternatives: WorkoutExerciseReference[];
  exercise: WorkoutExerciseReference;
  sets: { id: string; type: 'warmup' | 'working'; load: WorkoutExportLoad }[];
};

function exportItem(
  item: DocumentItem,
  library: WorkoutExportLibrary,
): WorkoutExportItem {
  const alternatives = item.alternatives.flatMap((reference) => {
    const alternative = resolvedAlternative(reference, library);
    return alternative === null ? [] : [alternative];
  });
  const videoUrl = liveVideo(library.resolve(item.exercise)?.videoUrl);
  return {
    name: item.name,
    ...(item.description === undefined
      ? {}
      : { description: item.description }),
    ...(item.reps === undefined ? {} : { reps: item.reps }),
    ...(item.restSec === undefined ? {} : { restSec: item.restSec }),
    ...(item.rir === undefined ? {} : { rir: item.rir }),
    ...(item.notes === undefined ? {} : { notes: item.notes }),
    alternatives,
    ...(videoUrl === undefined ? {} : { videoUrl }),
    sets: item.sets.map((set) => ({
      type: set.type,
      load: set.load as WorkoutExportLoad,
    })),
  };
}

/**
 * Validate the authorized revision document and build the export payload.
 * Unavailable alternative targets are omitted, never substituted.
 */
export function buildWorkoutExportPayload(
  input: BuildWorkoutExportPayloadInput,
): WorkoutExportPayload {
  const document = parseWorkoutDocumentV1(input.document);
  const planTitle = requiredText(input.plan?.title);
  const planIdentity = requiredText(input.plan.identity);
  const days = document.days.map((day): WorkoutExportDay => {
    const title = textOrUndefined(day.title);
    const notes = textOrUndefined(day.notes);
    if (day.kind === 'rest') {
      return {
        kind: 'rest',
        ...(title === undefined ? {} : { title }),
        ...(notes === undefined ? {} : { notes }),
        items: [],
      };
    }
    // `parseWorkoutDocumentV1` rejects every item that lacks this shape.
    const items = day.items as unknown as DocumentItem[];
    return {
      kind: 'session',
      ...(title === undefined ? {} : { title }),
      ...(notes === undefined ? {} : { notes }),
      items: items.map((item) => exportItem(item, input.library)),
    };
  });
  const planNotes =
    input.plan.notes === undefined ? {} : { planNotes: input.plan.notes };
  const documentNotes =
    document.notes === undefined ? {} : { documentNotes: document.notes };
  return {
    planTitle,
    planIdentity,
    ...planNotes,
    ...documentNotes,
    days,
  };
}
