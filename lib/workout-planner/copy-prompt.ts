import { getMessages } from '../i18n';
import type { Locale } from '../design/preferences';
import type { WorkoutExportPayload } from './export-payload';

function repsText(
  reps: NonNullable<
    WorkoutExportPayload['days'][number]['items'][number]['reps']
  >,
): string {
  return 'value' in reps ? String(reps.value) : `${reps.min}-${reps.max}`;
}

function loadText(
  load: WorkoutExportPayload['days'][number]['items'][number]['sets'][number]['load'],
  messages: ReturnType<typeof getMessages>,
): string {
  if (load.mode === 'bodyweight') return messages['workout.export.bodyweight'];
  const value = `${load.value} ${load.unit}`;
  return load.mode === 'assisted'
    ? `${messages['workout.export.assisted']}: ${value}`
    : value;
}

/** Render every field from the shared T038 authorized export payload. */
export function formatWorkoutPromptContent(
  payload: WorkoutExportPayload,
  locale: Locale = 'en',
): string {
  const messages = getMessages(locale);
  const lines = [
    `${messages['workout.export.plan']}: ${payload.planTitle} (${payload.planIdentity})`,
  ];
  const field = (label: string, value: string | number, indent = 2) =>
    lines.push(`${' '.repeat(indent)}${label}: ${value}`);
  if (payload.planNotes !== undefined)
    field(messages['workout.export.notes'], payload.planNotes, 0);
  if (payload.documentNotes !== undefined)
    field(messages['workout.export.notes'], payload.documentNotes, 0);
  payload.days.forEach((day, index) => {
    const dayTitle =
      day.title ?? `${messages['workout.export.day']} ${index + 1}`;
    lines.push(
      day.kind === 'rest'
        ? `${dayTitle} (${messages['workout.export.restDay']})`
        : dayTitle,
    );
    if (day.notes !== undefined)
      field(messages['workout.export.notes'], day.notes);
    for (const item of day.items) {
      field(messages['print.exercise'], item.name);
      if (item.description !== undefined)
        field(messages['workout.export.description'], item.description, 4);
      if (item.reps !== undefined)
        field(messages['print.reps'], repsText(item.reps), 4);
      if (item.restSec !== undefined)
        field(messages['workout.export.restSec'], item.restSec, 4);
      if (item.rir !== undefined)
        field(messages['workout.export.rir'], item.rir, 4);
      item.sets.forEach((set, setIndex) => {
        const type =
          set.type === 'warmup'
            ? messages['workout.export.warmUp']
            : messages['workout.export.working'];
        field(
          `${messages['workout.export.setType']} ${setIndex + 1} (${type})`,
          loadText(set.load, messages),
          4,
        );
      });
      if (item.notes !== undefined)
        field(messages['workout.export.notes'], item.notes, 4);
      item.alternatives.forEach((alternative) => {
        field(messages['workout.export.alternatives'], alternative.name, 4);
        if (alternative.videoUrl !== undefined)
          field(messages['workout.export.video'], alternative.videoUrl, 6);
      });
      if (item.videoUrl !== undefined)
        field(messages['workout.export.video'], item.videoUrl, 4);
    }
  });
  return lines.join('\n');
}
