import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadStrikeReview } from '../../lib/workforce/strikes';

const workspaceId = '00000000-0000-0000-0000-000000000001';
const trainerId = '11111111-1111-1111-1111-111111111111';
const strikeId = '22222222-2222-2222-2222-222222222222';

describe('loadStrikeReview correction history', () => {
  it('loads the PO correction projection for each strike without extra identifiers', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'get_workforce_strikes')
        return {
          data: {
            status: 'ok',
            count: 1,
            review_threshold: 0,
            strikes: [
              {
                strike_id: strikeId,
                breach_at: '2026-11-27T10:00:00.000Z',
                trainer_user_id: trainerId,
                voided: false,
              },
            ],
          },
          error: null,
        };
      return {
        data: {
          status: 'ok',
          corrections: [
            {
              strike_id: strikeId,
              action: 'void',
              reason_code: 'duplicate',
              actor_display_name: 'Platform Owner',
              created_at: '2026-11-27T11:00:00.000Z',
            },
          ],
        },
        error: null,
      };
    });
    const client = {
      from: (table: string) => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({
              data:
                table === 'workspace_memberships'
                  ? [
                      {
                        user_id: trainerId,
                        granted_at: '2026-01-01T00:00:00.000Z',
                        revoked_at: null,
                      },
                    ]
                  : [
                      {
                        user_id: trainerId,
                        role: 'trainer',
                        display_name: 'Coach Samira',
                      },
                    ],
              error: null,
            }).then(resolve),
        };
        return chain;
      },
      rpc,
    } as unknown as SupabaseClient;

    const result = await loadStrikeReview(client, workspaceId);
    expect(result).toMatchObject({
      status: 'ok',
      trainers: [
        {
          strikes: [
            {
              strikeId,
              corrections: [
                {
                  action: 'void',
                  reasonCode: 'duplicate',
                  actorDisplayName: 'Platform Owner',
                  createdAt: '2026-11-27T11:00:00.000Z',
                },
              ],
            },
          ],
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith(
      'get_workforce_strike_correction_history',
      {
        p_workspace_id: workspaceId,
        p_strike_id: strikeId,
      },
    );
  });
});
