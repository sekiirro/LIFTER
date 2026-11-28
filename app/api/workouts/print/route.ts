import { NextResponse } from 'next/server';
import {
  loadAuthorizedWorkoutExportPayload,
  parseWorkoutExportRequest,
  workoutExportDeniedResponse,
} from '../../../../lib/workout-planner/export-reader';

export async function GET(request: Request) {
  const parsed = parseWorkoutExportRequest(request);
  if (!parsed) return workoutExportDeniedResponse();

  const result = await loadAuthorizedWorkoutExportPayload({
    ...parsed,
    format: 'pdf',
  });
  if (!result.ok) return workoutExportDeniedResponse();

  return NextResponse.json(
    { status: 'ok', payload: result.payload },
    { headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } },
  );
}
