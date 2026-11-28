import type { SupabaseClient } from '@supabase/supabase-js';

export type StrikeReasonCode =
  | 'client_caused_delay'
  | 'system_issue'
  | 'wrong_trainer'
  | 'duplicate'
  | 'po_exception';

export type StrikeOperation = 'void' | 'reinstate' | 'reattribute';

export type EligibleStrikeTrainer = {
  userId: string;
  displayName: string | null;
};

export type StrikeCorrection = {
  action: StrikeOperation;
  reasonCode: StrikeReasonCode;
  actorDisplayName: string | null;
  createdAt: string;
};

export type StrikeRecord = {
  strikeId: string;
  breachAt: string;
  trainerUserId: string;
  voided: boolean;
  corrections: StrikeCorrection[];
  eligibleTrainers: EligibleStrikeTrainer[];
};

export type StrikeTrainerSummary = {
  userId: string;
  displayName: string | null;
  count: number;
  reviewThreshold: 0 | 3 | 6 | 9;
  strikes: StrikeRecord[];
};

export type StrikeReviewResult =
  | { status: 'ok'; trainers: StrikeTrainerSummary[] }
  | { status: 'denied' | 'error' };

type StrikeRpcPayload = {
  status?: string;
  count?: number;
  review_threshold?: number;
  strikes?: Array<{
    strike_id: string;
    breach_at: string;
    trainer_user_id: string;
    voided: boolean;
  }>;
};

type StrikeCorrectionHistoryPayload = {
  status?: string;
  corrections?: Array<{
    action: StrikeOperation;
    reason_code: StrikeReasonCode;
    actor_display_name: string | null;
    created_at: string;
  }>;
};

export async function loadStrikeReview(
  client: SupabaseClient,
  workspaceId: string,
): Promise<StrikeReviewResult> {
  const { data: memberships, error: membershipError } = await client
    .from('workspace_memberships')
    .select('user_id, granted_at, revoked_at')
    .eq('workspace_id', workspaceId);
  if (membershipError) return { status: 'error' };
  const memberIds = [
    ...new Set((memberships ?? []).map((membership) => membership.user_id)),
  ];
  if (memberIds.length === 0) return { status: 'ok', trainers: [] };
  const { data: profiles, error: profilesError } = await client
    .from('staff_profiles')
    .select('user_id, role, display_name')
    .in('user_id', memberIds)
    .eq('role', 'trainer');
  if (profilesError) return { status: 'error' };
  const trainers = profiles ?? [];

  const summaries = await Promise.all(
    trainers.map(async (trainer): Promise<StrikeTrainerSummary | null> => {
      const { data, error } = await client.rpc('get_workforce_strikes', {
        p_workspace_id: workspaceId,
        p_trainer_user_id: trainer.user_id,
      });
      if (error || !data) return null;
      const payload = data as StrikeRpcPayload;
      if (payload.status !== 'ok') return null;
      const strikes = await Promise.all(
        (payload.strikes ?? []).map(
          async (strike): Promise<StrikeRecord | null> => {
            const { data: historyData, error: historyError } = await client.rpc(
              'get_workforce_strike_correction_history',
              { p_workspace_id: workspaceId, p_strike_id: strike.strike_id },
            );
            if (historyError || !historyData) return null;
            const history = historyData as StrikeCorrectionHistoryPayload;
            if (history.status !== 'ok') return null;
            return {
              strikeId: strike.strike_id,
              breachAt: strike.breach_at,
              trainerUserId: strike.trainer_user_id,
              voided: strike.voided,
              corrections: (history.corrections ?? []).map((correction) => ({
                action: correction.action,
                reasonCode: correction.reason_code,
                actorDisplayName: correction.actor_display_name,
                createdAt: correction.created_at,
              })),
              eligibleTrainers: trainers
                .filter(
                  (candidate) => candidate.user_id !== strike.trainer_user_id,
                )
                .filter((candidate) =>
                  (memberships ?? []).some(
                    (membership) =>
                      membership.user_id === candidate.user_id &&
                      membership.granted_at <= strike.breach_at &&
                      (membership.revoked_at === null ||
                        membership.revoked_at > strike.breach_at),
                  ),
                )
                .map((candidate) => ({
                  userId: candidate.user_id,
                  displayName: candidate.display_name,
                })),
            };
          },
        ),
      );
      if (strikes.some((strike) => strike === null)) return null;
      const threshold = payload.review_threshold;
      return {
        userId: trainer.user_id,
        displayName: trainer.display_name,
        count: payload.count ?? 0,
        reviewThreshold:
          threshold === 3 || threshold === 6 || threshold === 9 ? threshold : 0,
        strikes: strikes as StrikeRecord[],
      };
    }),
  );

  if (summaries.some((summary) => summary === null)) return { status: 'error' };
  return { status: 'ok', trainers: summaries as StrikeTrainerSummary[] };
}
