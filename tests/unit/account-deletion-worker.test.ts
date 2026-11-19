import { describe, expect, it, vi } from 'vitest';
import {
  buildClearedMetadataPayload,
  deletionRetryAt,
  isMetadataEmpty,
  placeholderDeletionEmail,
} from '../../lib/client-accounts/deletion-policy';
import { authorize } from '../../lib/auth/authorize';
import { CAPABILITIES } from '../../lib/auth/capabilities';
import { drainAccountDeletions } from '../../workers/cron/src/account-deletion';

const intent = (
  digit: string,
  overrides: Partial<{
    state:
      | 'pending_ban'
      | 'banned_pending_db'
      | 'release_pending'
      | 'auth_release_in_progress';
    target_kind: 'client' | 'staff';
    attempts: number;
  }> = {},
) => ({
  id: `00000000-0000-4000-8000-00000000000${digit}`,
  target_user_id: `10000000-0000-4000-8000-00000000000${digit}`,
  target_kind: overrides.target_kind ?? 'client',
  state: overrides.state ?? 'pending_ban',
  attempts: overrides.attempts ?? 0,
  lease_token: `20000000-0000-4000-8000-00000000000${digit}`,
});

describe('account deletion worker & policy', () => {
  it('denies every capability in app authorize() when actor.deleted is true', () => {
    const actor = {
      userId: 'po-1',
      role: 'platform_owner' as const,
      activeWorkspaceIds: ['ws-1'],
      deleted: true,
    };
    for (const cap of CAPABILITIES) {
      expect(authorize(actor, cap, 'ws-1')).toBe(false);
    }
  });

  it('builds key-nulling patch for nonstandard and nested metadata keys', () => {
    expect(buildClearedMetadataPayload(null)).toBeNull();
    expect(buildClearedMetadataPayload({})).toBeNull();
    expect(
      buildClearedMetadataPayload({
        full_name: 'Alice',
        custom_profile: { nested: 'secret' },
        email_verified: true,
      }),
    ).toEqual({
      full_name: null,
      custom_profile: null,
      email_verified: null,
    });
    expect(isMetadataEmpty({})).toBe(true);
    expect(isMetadataEmpty({ custom: 'x' })).toBe(false);
  });

  it('drives pending_ban through steps (A) -> (B) -> (C) -> (D) with metadata re-read verification', async () => {
    const item = intent('1', { state: 'pending_ban', target_kind: 'staff' });
    const sequence: string[] = [];
    let metadataCleared = false;

    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.includes('/auth/v1/admin/users/')) {
          const body = init?.body
            ? (JSON.parse(String(init.body)) as Record<string, unknown>)
            : null;
          sequence.push(`auth:${method}`);
          if (method === 'GET') {
            return Response.json(
              metadataCleared
                ? {
                    id: item.target_user_id,
                    email: placeholderDeletionEmail(item.id),
                    phone: '',
                    user_metadata: {},
                  }
                : {
                    id: item.target_user_id,
                    email: 'staff@example.test',
                    phone: '+201000000001',
                    user_metadata: {
                      email_verified: true,
                      custom: { nested: 'pii' },
                    },
                  },
            );
          }
          if (method === 'PUT' && body && 'email' in body) {
            expect(body.user_metadata).toEqual({
              email_verified: null,
              custom: null,
            });
            expect(body.phone).toBe('');
            metadataCleared = true;
          }
          return Response.json({ id: item.target_user_id });
        }

        const rpc = url.split('/').at(-1)!;
        sequence.push(`rpc:${rpc}`);
        if (rpc === 'claim_account_deletion_intents') {
          return Response.json([item]);
        }
        return Response.json(true);
      },
    );

    const result = await drainAccountDeletions(
      {
        SUPABASE_URL: 'http://127.0.0.1:35421',
        SUPABASE_SERVICE_ROLE_KEY: 'test-only',
      },
      { fetcher },
    );

    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0 });
    expect(sequence).toEqual([
      'rpc:claim_account_deletion_intents',
      'auth:PUT',
      'rpc:advance_deletion_step_a',
      'rpc:execute_deletion_step_b',
      'rpc:begin_deletion_step_c',
      'auth:GET',
      'auth:PUT',
      'auth:GET',
      'rpc:execute_deletion_step_d',
    ]);
  });

  it('refuses execute_deletion_step_d and schedules retry when re-read metadata remains non-empty', async () => {
    const item = intent('2', {
      state: 'auth_release_in_progress',
      attempts: 1,
    });
    const calls: string[] = [];
    const retried: Record<string, unknown>[] = [];
    const fixedNow = new Date('2026-11-18T00:00:00.000Z');

    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.includes('/auth/v1/admin/users/')) {
          calls.push(`auth:${method}`);
          if (method === 'GET') {
            return Response.json({
              id: item.target_user_id,
              email: placeholderDeletionEmail(item.id),
              phone: '',
              user_metadata: { stubborn_key: 'still-here' },
            });
          }
          return Response.json({ id: item.target_user_id });
        }
        const rpc = url.split('/').at(-1)!;
        calls.push(`rpc:${rpc}`);
        if (rpc === 'claim_account_deletion_intents') {
          return Response.json([item]);
        }
        if (rpc === 'retry_account_deletion_intent') {
          retried.push(
            JSON.parse(String(init?.body)) as Record<string, unknown>,
          );
        }
        return Response.json(true);
      },
    );

    const result = await drainAccountDeletions(
      {
        SUPABASE_URL: 'http://127.0.0.1:35421',
        SUPABASE_SERVICE_ROLE_KEY: 'test-only',
      },
      { fetcher, now: () => fixedNow },
    );

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 1 });
    expect(calls).not.toContain('rpc:execute_deletion_step_d');
    expect(retried).toEqual([
      {
        p_intent_id: item.id,
        p_lease_token: item.lease_token,
        p_attempt: 2,
        p_retry_at: deletionRetryAt(2, fixedNow).toISOString(),
        p_safe_error_code: 'metadata_not_empty',
      },
    ]);
  });

  it('continues draining batch and throws sanitized error when retry persistence fails', async () => {
    const items = [intent('3'), intent('4')];
    const poisonSecret = 'service-role-poison-secret';
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/auth/v1/admin/users/')) {
          if (url.includes(items[0]!.target_user_id)) {
            throw new Error(`network failure with ${poisonSecret}`);
          }
          if ((init?.method ?? 'GET') === 'GET') {
            return Response.json({
              id: items[1]!.target_user_id,
              email: placeholderDeletionEmail(items[1]!.id),
              phone: '',
              user_metadata: {},
            });
          }
          return Response.json({ id: items[1]!.target_user_id });
        }
        const rpc = url.split('/').at(-1)!;
        if (rpc === 'claim_account_deletion_intents') {
          return Response.json(items);
        }
        if (rpc === 'retry_account_deletion_intent') {
          throw new Error(`db failure leaking ${poisonSecret}`);
        }
        return Response.json(true);
      },
    );

    let thrown: unknown;
    try {
      await drainAccountDeletions(
        {
          SUPABASE_URL: 'http://127.0.0.1:35421',
          SUPABASE_SERVICE_ROLE_KEY: poisonSecret,
        },
        { fetcher },
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      'account_deletion_persistence_failed',
    );
    expect((thrown as Error).message).not.toContain(poisonSecret);
  });
});
