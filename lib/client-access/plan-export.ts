/**
 * F22 US4 client plan export (FR-006, FR-008, FR-010, FR-012; S54-PO-12).
 *
 * Authorization is the database client wall `client_portal_nutrition_plan`
 * (own delivered revision, fresh F13 entitlement, published revisions only);
 * this module never accepts a client, workspace or entitlement from the
 * caller. The returned revision is rendered by the F18 builders
 * (`renderNutritionPrintHtml`, `buildNutritionWorkbook`) unchanged, so
 * selections, revision-specific totals and spreadsheet formula protection are
 * F18's. The F18 audit recorder `record_nutrition_export_audit` (which already
 * accepts the plan's own approved client) records every export and denial; a
 * success audit failure fails closed and releases no file.
 *
 * Workout exports are BLOCKED (no client-authorized F16 exercise projection).
 */
import {
  buildNutritionWorkbook,
  renderNutritionPrintHtml,
} from '../plans/nutrition/export';
import { loadClientNutritionPlan } from './portal';
import type { Locale } from '../design/preferences';

export const EXPORT_FORMATS = ['pdf', 'excel'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function parseExportFormat(value: unknown): ExportFormat | null {
  return (EXPORT_FORMATS as readonly unknown[]).includes(value)
    ? (value as ExportFormat)
    : null;
}

type ExportRpc = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export type ClientExportResult =
  | {
      status: 'ok';
      format: ExportFormat;
      contentType: string;
      filename: string;
      body: string | Uint8Array;
    }
  | { status: 'denied' };

async function audit(
  client: ExportRpc,
  args: {
    workspaceId: string | null;
    planId: string;
    revisionId: string | null;
    outcome: 'success' | 'denied';
    reason?: 'not_permitted' | 'not_found';
  },
): Promise<boolean> {
  try {
    const { error } = await client.rpc('record_nutrition_export_audit', {
      p_workspace_id: args.workspaceId,
      p_plan_id: args.planId,
      p_revision_id: args.revisionId,
      p_outcome: args.outcome,
      p_reason: args.reason ?? null,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Export the selected own delivered nutrition revision. Every failure
 * (restricted, foreign, undelivered, draft-only, unknown, audit failure) is
 * the same `denied` to the caller.
 */
export async function exportClientNutritionPlan(
  client: ExportRpc,
  request: {
    planId: string;
    revisionNumber: number | null;
    format: ExportFormat;
    locale: Locale;
  },
): Promise<ClientExportResult> {
  const result = await loadClientNutritionPlan(
    client,
    request.planId,
    request.revisionNumber,
  );
  if (result.status !== 'ok') {
    // A denial audit row is written only for an entitlement denial of the
    // authenticated client (restricted state). Unknown, foreign or malformed
    // targets write nothing: the recorder derives the row's target from a
    // caller-chosen id, so auditing them would let a client plant rows.
    // Best effort: a denial stays a denial even when the audit sink fails.
    if (result.status === 'restricted')
      await audit(client, {
        workspaceId: null,
        planId: request.planId,
        revisionId: null,
        outcome: 'denied',
        reason: 'not_permitted',
      });
    return { status: 'denied' };
  }
  const { projection } = result;
  try {
    const filename = `nutrition-plan-r${projection.revision.revisionNumber}`;
    let output: ClientExportResult;
    if (request.format === 'pdf') {
      output = {
        status: 'ok',
        format: 'pdf',
        contentType: 'text/html; charset=utf-8',
        filename: `${filename}.html`,
        body: renderNutritionPrintHtml(projection, request.locale),
      };
    } else {
      const workbook = await buildNutritionWorkbook(projection, request.locale);
      output = {
        status: 'ok',
        format: 'excel',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${filename}.xlsx`,
        body: new Uint8Array(await workbook.xlsx.writeBuffer()),
      };
    }
    // Fail closed: no file is released unless the success audit is written.
    const audited = await audit(client, {
      workspaceId: projection.plan.workspaceId,
      planId: request.planId,
      revisionId: projection.revision.id,
      outcome: 'success',
    });
    return audited ? output : { status: 'denied' };
  } catch {
    return { status: 'denied' };
  }
}
