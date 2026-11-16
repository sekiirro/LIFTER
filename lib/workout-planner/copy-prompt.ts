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
  if (payload.planNotes !== undefined)
    lines.push(`${messages['workout.export.notes']}: ${payload.planNotes}`);
  if (payload.documentNotes !== undefined)
    lines.push(`${messages['workout.export.notes']}: ${payload.documentNotes}`);
  payload.days.forEach((day, index) => {
    const dayTitle =
      day.title ?? `${messages['workout.export.day']} ${index + 1}`;
    lines.push(
      day.kind === 'rest'
        ? `${dayTitle} (${messages['workout.export.restDay']})`
        : dayTitle,
    );
    if (day.notes !== undefined)
      lines.push(`  ${messages['workout.export.notes']}: ${day.notes}`);
    for (const item of day.items) {
      lines.push(`  ${messages['print.exercise']}: ${item.name}`);
      if (item.description !== undefined)
        lines.push(
          `    ${messages['workout.export.description']}: ${item.description}`,
        );
      if (item.reps !== undefined)
        lines.push(`    ${messages['print.reps']}: ${repsText(item.reps)}`);
      if (item.restSec !== undefined)
        lines.push(
          `    ${messages['workout.export.restSec']}: ${item.restSec}`,
        );
      if (item.rir !== undefined)
        lines.push(`    ${messages['workout.export.rir']}: ${item.rir}`);
      item.sets.forEach((set, setIndex) => {
        const type =
          set.type === 'warmup'
            ? messages['workout.export.warmUp']
            : messages['workout.export.working'];
        lines.push(
          `    ${messages['workout.export.setType']} ${setIndex + 1} (${type}): ${loadText(set.load, messages)}`,
        );
      });
      if (item.notes !== undefined)
        lines.push(`    ${messages['workout.export.notes']}: ${item.notes}`);
      item.alternatives.forEach((alternative) => {
        lines.push(
          `    ${messages['workout.export.alternatives']}: ${alternative.name}`,
        );
        if (alternative.videoUrl !== undefined)
          lines.push(
            `      ${messages['workout.export.video']}: ${alternative.videoUrl}`,
          );
      });
      if (item.videoUrl !== undefined)
        lines.push(`    ${messages['workout.export.video']}: ${item.videoUrl}`);
    }
  });
  return lines.join('\n');
}
