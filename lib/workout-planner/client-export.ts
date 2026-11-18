// F16/F17 client workout view and export entry points (F22 T017, T023-T028;
// FR-006, FR-008, FR-010, FR-012; F17 FR-017/FR-018).
//
// Authorization is the database client wall `client_portal_workout_plan`
// (own delivered published revision, fresh F13 entitlement) read through
// `loadClientWorkoutPlan`; nothing here accepts a client, workspace or
// entitlement from the caller, and the staff reader (`export-reader.ts`,
// coaching_work) is not weakened or reused for clients.
//
// Output is the F17 content unchanged:
//   - `readClientWorkoutView`: payload for the shared `WorkoutPrintView`
//     (portal plan body). Viewing is not an export and writes no audit event.
//   - `exportClientWorkoutPlan`: `pdf` returns the same payload for the F17
//     print view (the F17 PDF is that view printed, contracts/export-and-
//     ai-prompt.md section 1); `excel` returns the F17 workbook bytes. Every
//     export and denial is audited through `record_workout_export_audit`; a
//     success audit failure fails closed and releases nothing.
//
// Every failure (restricted, foreign, undelivered, draft-only, unknown,
// unresolvable exercise, audit failure) is the same `denied`.

import type { Locale } from '../design/preferences';
import {
  buildClientWorkoutPayload,
  loadClientWorkoutPlan,
  type ClientWorkoutPlan,
  type ClientWorkoutRpc,
  type ClientWorkoutSubscription,
} from './client-projection';
import { buildWorkoutWorkbook } from './excel-export';
import {
  recordWorkoutExportAudit,
  type WorkoutExportDenialReason,
} from './export-audit';
import type { WorkoutExportPayload } from './export-payload';

export const CLIENT_WORKOUT_EXPORT_FORMATS = ['pdf', 'excel'] as const;
export type ClientWorkoutExportFormat =
  (typeof CLIENT_WORKOUT_EXPORT_FORMATS)[number];

export function parseClientWorkoutExportFormat(
  value: unknown,
): ClientWorkoutExportFormat | null {
  return (CLIENT_WORKOUT_EXPORT_FORMATS as readonly unknown[]).includes(value)
    ? (value as ClientWorkoutExportFormat)
    : null;
}

export type ClientWorkoutViewResult =
  | {
      status: 'ok';
      subscription: ClientWorkoutSubscription;
      revisionNumber: number;
      payload: WorkoutExportPayload;
    }
  | { status: 'restricted'; subscription: ClientWorkoutSubscription }
  | { status: 'not_found' }
  | { status: 'denied' };

export type ClientWorkoutExportResult =
  | {
      status: 'ok';
      format: 'pdf';
      revisionNumber: number;
      payload: WorkoutExportPayload;
    }
  | {
      status: 'ok';
      format: 'excel';
      revisionNumber: number;
      contentType: string;
      filename: string;
      body: Uint8Array;
    }
  | { status: 'denied' };

type AuditClient = Parameters<typeof recordWorkoutExportAudit>[0];

/**
 * Own delivered workout revision as the shared F17 payload, for the portal
 * plan page and its embedded print view.
 */
export async function readClientWorkoutView(
  client: ClientWorkoutRpc,
  request: { planId: string; revisionNumber: number | null; locale: Locale },
): Promise<ClientWorkoutViewResult> {
  const result = await loadClientWorkoutPlan(
    client,
    request.planId,
    request.revisionNumber,
  );
  if (result.status !== 'ok') return result;
  try {
    return {
      status: 'ok',
      subscription: result.subscription,
      revisionNumber: result.projection.plan.revisionNumber,
      payload: buildClientWorkoutPayload(result.projection, request.locale),
    };
  } catch {
    return { status: 'denied' };
  }
}

async function auditDenied(
  client: ClientWorkoutRpc,
  request: { planId: string; format: ClientWorkoutExportFormat },
  result: Exclude<ClientWorkoutPlan, { status: 'ok' }>,
): Promise<void> {
  const reason: WorkoutExportDenialReason =
    result.status === 'not_found' ? 'not_found' : 'not_permitted';
  try {
    // The recorder derives scope from the caller's own client record; a plan
    // that is not theirs is stored without any foreign identity.
    await recordWorkoutExportAudit(client as unknown as AuditClient, {
      workspaceId: null,
      planId: request.planId,
      revisionId: null,
      format: request.format,
      outcome: 'denied',
      reason,
    });
  } catch {
    // A denial stays a denial even when the audit sink is unavailable.
  }
}

/**
 * Export the selected own delivered workout revision (F17 PDF print view or
 * Excel workbook). Success is audited fail-closed; every denial is audited
 * best effort.
 */
export async function exportClientWorkoutPlan(
  client: ClientWorkoutRpc,
  request: {
    planId: string;
    revisionNumber: number | null;
    format: ClientWorkoutExportFormat;
    locale: Locale;
  },
): Promise<ClientWorkoutExportResult> {
  const result = await loadClientWorkoutPlan(
    client,
    request.planId,
    request.revisionNumber,
  );
  if (result.status !== 'ok') {
    await auditDenied(client, request, result);
    return { status: 'denied' };
  }
  const { projection } = result;
  try {
    const payload = buildClientWorkoutPayload(projection, request.locale);
    let output: ClientWorkoutExportResult;
    if (request.format === 'pdf') {
      output = {
        status: 'ok',
        format: 'pdf',
        revisionNumber: projection.plan.revisionNumber,
        payload,
      };
    } else {
      const workbook = buildWorkoutWorkbook(payload, request.locale);
      output = {
        status: 'ok',
        format: 'excel',
        revisionNumber: projection.plan.revisionNumber,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `workout-plan-r${projection.plan.revisionNumber}.xlsx`,
        body: new Uint8Array(await workbook.xlsx.writeBuffer()),
      };
    }
    // Fail closed: nothing is released unless the success audit is written.
    await recordWorkoutExportAudit(client as unknown as AuditClient, {
      workspaceId: projection.plan.workspaceId,
      planId: request.planId,
      revisionId: projection.plan.revisionId,
      format: request.format,
      outcome: 'success',
    });
    return output;
  } catch {
    return { status: 'denied' };
  }
}
