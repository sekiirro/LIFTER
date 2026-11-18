/**
 * F22 client nutrition view/export projection (FR-004, FR-006, FR-008, FR-010;
 * S57-PO-9). The database boundary `client_portal_nutrition_plan` derives the
 * client from the signed identity, applies fresh F13 entitlement and returns
 * one own delivered revision of F18 content plus the client's own selections
 * for that exact revision. This module is the app-layer wall: it accepts only
 * the closed result shape and builds the F18 `NutritionExportProjection`, so
 * the F18 print and Excel builders render the revision unchanged (no second
 * renderer or export engine; selection fidelity is the F18 projection rule).
 *
 * Type-only import from the F18 exporter keeps ExcelJS out of this module.
 */
import {
  computeDocumentValues,
  type ComputedValues,
  type NutritionSnapshotMap,
} from '../plans/nutrition/macros';
import type { NutritionExportProjection } from '../plans/nutrition/export';
import type { NutritionDocumentV1 } from '../plans/nutrition/types';
import {
  isUuid,
  parseSubscription,
  type SubscriptionSummary,
} from './portal-projection';

export type ClientNutritionPlan =
  | {
      status: 'ok';
      subscription: SubscriptionSummary;
      projection: NutritionExportProjection;
    }
  | { status: 'restricted'; subscription: SubscriptionSummary }
  | { status: 'not_found' }
  | { status: 'denied' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function projectClientNutritionPlan(
  raw: unknown,
  requested: { planId: string; revisionNumber: number | null },
): ClientNutritionPlan {
  if (!isRecord(raw)) return { status: 'denied' };
  if (raw.status === 'not_found') return { status: 'not_found' };
  const subscription = parseSubscription(raw.subscription);
  if (!subscription) return { status: 'denied' };
  // Only an explicit F13 `active` state may accompany plan content.
  if (raw.status === 'restricted' || subscription.status !== 'active')
    return raw.status === 'restricted' || raw.status === 'ok'
      ? {
          status: 'restricted',
          subscription: {
            status: subscription.status,
            effectiveEndExclusive: subscription.effectiveEndExclusive,
            ...(subscription.refundScope
              ? { refundScope: subscription.refundScope }
              : {}),
          },
        }
      : { status: 'denied' };
  if (
    raw.status !== 'ok' ||
    !isRecord(raw.plan) ||
    !isRecord(raw.content) ||
    !Array.isArray(raw.selections)
  )
    return { status: 'denied' };
  const { plan, content } = raw;
  if (
    plan.plan_id !== requested.planId ||
    !isUuid(plan.workspace_id) ||
    !isUuid(plan.client_id) ||
    !isUuid(plan.revision_id) ||
    typeof plan.revision_number !== 'number' ||
    !Number.isSafeInteger(plan.revision_number) ||
    plan.revision_number < 1 ||
    (requested.revisionNumber !== null &&
      plan.revision_number !== requested.revisionNumber) ||
    typeof plan.published_at !== 'string' ||
    Number.isNaN(Date.parse(plan.published_at)) ||
    !isRecord(content.document) ||
    !isRecord(content.snapshot_map) ||
    !isRecord(content.computed_values)
  )
    return { status: 'denied' };

  const selectedAlternativeIds: Record<string, string> = Object.create(null);
  for (const row of raw.selections) {
    if (
      !isRecord(row) ||
      !nonEmpty(row.item_id) ||
      !nonEmpty(row.alternative_id) ||
      row.item_id in selectedAlternativeIds
    )
      return { status: 'denied' };
    selectedAlternativeIds[row.item_id] = row.alternative_id;
  }

  const document = content.document as unknown as NutritionDocumentV1;
  const snapshotMap = content.snapshot_map as unknown as NutritionSnapshotMap;
  const computedValues = content.computed_values as unknown as ComputedValues;

  // Same selection representation as the F18 reader: selected values are
  // recomputed from the revision's own snapshot, never from other revisions.
  let selectedValues: ComputedValues | null = null;
  if (Object.keys(selectedAlternativeIds).length > 0) {
    try {
      selectedValues = computeDocumentValues(
        document,
        snapshotMap,
        selectedAlternativeIds,
      );
    } catch {
      return { status: 'denied' };
    }
  }
  const title = document.title
    ? (document.title.en ?? document.title.ar ?? null)
    : null;
  return {
    status: 'ok',
    subscription,
    projection: {
      plan: {
        id: requested.planId,
        workspaceId: plan.workspace_id,
        clientId: plan.client_id,
        title,
      },
      revision: {
        id: plan.revision_id,
        revisionNumber: plan.revision_number,
        publishedAt: plan.published_at,
      },
      content: { document, computedValues, snapshotMap },
      selection: Object.entries(selectedAlternativeIds).map(
        ([itemId, alternativeId]) => ({
          itemId,
          alternativeId,
          selectedValues: selectedValues?.items[itemId],
        }),
      ),
      selectedAlternativeIds,
      selectedValues,
    },
  };
}
