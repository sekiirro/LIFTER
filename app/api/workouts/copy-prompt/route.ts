import { NextResponse } from 'next/server';
import {
  buildAiPrompt,
  containsProhibitedInstruction,
} from '../../../../lib/workout-planner/ai-prompt';
import { formatWorkoutPromptContent } from '../../../../lib/workout-planner/copy-prompt';
import { loadAuthorizedWorkoutExportPayload } from '../../../../lib/workout-planner/export-reader';
import type { Locale } from '../../../../lib/design/preferences';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const denied = () =>
  NextResponse.json({ status: 'unavailable' }, { status: 404 });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const revisionId = url.searchParams.get('revision');
  const localeValue = url.searchParams.get('locale');
  if (
    !revisionId ||
    !UUID.test(revisionId) ||
    (localeValue !== 'en' && localeValue !== 'ar')
  ) {
    return denied();
  }
  const locale: Locale = localeValue;

  const result = await loadAuthorizedWorkoutExportPayload({
    revisionId,
    locale,
    format: 'ai_prompt',
  });
  if (!result.ok) return denied();

  try {
    const prompt = buildAiPrompt(
      locale,
      formatWorkoutPromptContent(result.payload, locale),
    );
    if (containsProhibitedInstruction(prompt)) return denied();
    return NextResponse.json(
      { status: 'ok', prompt },
      { headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } },
    );
  } catch {
    return denied();
  }
}
