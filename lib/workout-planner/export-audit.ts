// F17 export audit writer (T039; FR-017, SC-008).
//
// Thin client wrapper around the SECURITY DEFINER recorder. Only identity,
// format, outcome and a closed denial reason code are ever sent. Coach
// content, notes, exercise names, URLs, client data and PII are not parameters
// and cannot reach the audit log.

import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkoutExportFormat = 'pdf' | 'excel' | 'ai_prompt';
export type WorkoutExportOutcome = 'success' | 'denied';
export type WorkoutExportDenialReason = 'not_permitted' | 'not_found';

export type WorkoutExportAuditInput = {
  workspaceId: string | null;
  planId: string | null;
  revisionId: string | null;
  format: WorkoutExportFormat;
  outcome: WorkoutExportOutcome;
  reason?: WorkoutExportDenialReason;
};

export async function recordWorkoutExportAudit(
  client: SupabaseClient,
  input: WorkoutExportAuditInput,
): Promise<void> {
  if (typeof client?.rpc !== 'function') {
    throw new Error('Workout export audit failed');
  }
  try {
    const { error } = await client.rpc('record_workout_export_audit', {
      p_workspace_id: input.workspaceId,
      p_plan_id: input.planId,
      p_revision_id: input.revisionId,
      p_format: input.format,
      p_outcome: input.outcome,
      p_reason: input.reason ?? null,
    });
    if (error) throw new Error('Workout export audit failed');
  } catch {
    throw new Error('Workout export audit failed');
  }
}
