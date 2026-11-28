import { NextResponse } from 'next/server';
import {
  buildAiPrompt,
  containsProhibitedInstruction,
} from '../../../../lib/workout-planner/ai-prompt';
import { formatWorkoutPromptContent } from '../../../../lib/workout-planner/copy-prompt';
import {
  loadAuthorizedWorkoutExportPayload,
  parseWorkoutExportRequest,
  workoutExportDeniedResponse,
} from '../../../../lib/workout-planner/export-reader';

export async function GET(request: Request) {
  const parsed = parseWorkoutExportRequest(request);
  if (!parsed) return workoutExportDeniedResponse();
  const { revisionId, locale } = parsed;

  const result = await loadAuthorizedWorkoutExportPayload({
    revisionId,
    locale,
    format: 'ai_prompt',
  });
  if (!result.ok) return workoutExportDeniedResponse();

  try {
    const prompt = buildAiPrompt(
      locale,
      formatWorkoutPromptContent(result.payload, locale),
    );
    if (containsProhibitedInstruction(prompt))
      return workoutExportDeniedResponse();
    return NextResponse.json(
      { status: 'ok', prompt },
      { headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } },
    );
  } catch {
    return workoutExportDeniedResponse();
  }
}
