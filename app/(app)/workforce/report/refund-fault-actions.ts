'use server';

import { requireActor } from '../../../../lib/auth/actor';
import { createSessionClient } from '../../../../lib/supabase/server';

export type OpenRefundFaultReview = {
  review_id: string;
  acquisition_key: string;
  purchase_id: string;
  opened_at: string;
};

export type RefundFaultReviewResult =
  | { status: 'ok'; reviews: OpenRefundFaultReview[] }
  | { status: 'denied' | 'error' };

export type RefundFaultResolutionInput = {
  workspaceId: string;
  reviewId: string;
  requestKey: string;
  staffFault: boolean;
  staffDeductions: { staffUserId: string; points: string }[];
};

export type RefundFaultResolutionResult =
  | { status: 'ok' }
  | { status: 'denied' | 'invalid_input' | 'duplicate' | 'error' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POINTS = /^-(0\.(0[1-9]|[1-9][0-9])|[1-9][0-9]{0,7}\.[0-9]{2})$/;

export async function listOpenRefundFaultReviewsAction(
  workspaceId: string,
): Promise<RefundFaultReviewResult> {
  const actor = await requireActor();
  if (actor.role !== 'platform_owner') return { status: 'denied' };
  if (typeof workspaceId !== 'string' || !UUID.test(workspaceId))
    return { status: 'error' };

  const client = await createSessionClient();
  if (!client) return { status: 'error' };
  const { data, error } = await client.rpc(
    'p7_list_open_refund_fault_reviews',
    { p_workspace_id: workspaceId },
  );
  if (error || !data || typeof data !== 'object') return { status: 'error' };
  const payload = data as { status?: unknown; reviews?: unknown };
  if (payload.status === 'not_permitted') return { status: 'denied' };
  if (
    payload.status !== 'ok' ||
    !Array.isArray(payload.reviews) ||
    !payload.reviews.every(isOpenReview)
  )
    return { status: 'error' };
  return { status: 'ok', reviews: payload.reviews };
}

function isOpenReview(value: unknown): value is OpenRefundFaultReview {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.review_id === 'string' &&
    UUID.test(row.review_id) &&
    typeof row.acquisition_key === 'string' &&
    typeof row.purchase_id === 'string' &&
    UUID.test(row.purchase_id) &&
    typeof row.opened_at === 'string' &&
    !Number.isNaN(Date.parse(row.opened_at))
  );
}

export async function resolveRefundFaultReviewAction(
  input: RefundFaultResolutionInput,
): Promise<RefundFaultResolutionResult> {
  const actor = await requireActor();
  if (actor.role !== 'platform_owner') return { status: 'denied' };
  if (
    !input ||
    typeof input !== 'object' ||
    !UUID.test(input.workspaceId) ||
    !UUID.test(input.reviewId) ||
    !UUID.test(input.requestKey) ||
    typeof input.staffFault !== 'boolean' ||
    !Array.isArray(input.staffDeductions) ||
    input.staffDeductions.some(
      (item) =>
        !item ||
        !UUID.test(item.staffUserId) ||
        typeof item.points !== 'string' ||
        !POINTS.test(item.points),
    ) ||
    new Set(input.staffDeductions.map((item) => item.staffUserId)).size !==
      input.staffDeductions.length ||
    (!input.staffFault && input.staffDeductions.length !== 0)
  )
    return { status: 'invalid_input' };

  const client = await createSessionClient();
  if (!client) return { status: 'error' };
  const { data, error } = await client.rpc('p7_resolve_refund_fault_review', {
    request: {
      workspace_id: input.workspaceId,
      review_id: input.reviewId,
      request_key: input.requestKey,
      expected_revision: 0,
      staff_fault: input.staffFault,
      staff_deductions: input.staffDeductions.map((item) => ({
        staff_user_id: item.staffUserId,
        points: item.points,
      })),
    },
  });
  if (error || !data || typeof data !== 'object') return { status: 'error' };
  const payload = data as { status?: unknown };
  if (payload.status === 'not_permitted') return { status: 'denied' };
  if (payload.status === 'ok') return { status: 'ok' };
  if (payload.status === 'invalid_input') return { status: 'invalid_input' };
  if (payload.status === 'key_conflict') return { status: 'duplicate' };
  return { status: 'error' };
}
