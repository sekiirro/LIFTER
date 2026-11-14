import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import { signup, signupFixture } from './client-accounts-fixture';
import {
  leaderboardClient,
  leaderboardContext,
  syntheticUsername,
  type LeaderboardContext,
} from './leaderboard-fixture';
import { anonClient, sql } from './harness';

// T008/T010 [FR-022, FR-037; S55-PO-6 Q11; S55-PO-9 Q14]
let f: LeaderboardContext;
const db = sql();
beforeAll(async () => {
  f = await leaderboardContext();
});
afterAll(() => db.end());

function inWorkspaceB(context: LeaderboardContext) {
  return {
    ...context,
    wsA: context.wsB,
    p: { ...context.p, versionId: context.offerB.versionId },
  } as unknown as Parameters<typeof signupFixture>[0];
}

describe('F11 invitation-link signup applies Q14', () => {
  it('rejects 21-character usernames before admission redemption', async () => {
    const fixture = await signupFixture(f);
    expect(
      await signup(db, fixture, {
        ...fixture.fields,
        username: `a${'b'.repeat(20)}`,
      }),
    ).toEqual({ status: 'invalid' });
    expect(
      await db`select 1 from app_private.signup_admission_tickets where id=${fixture.ticket} and redeemed_at is not null`,
    ).toHaveLength(0);
  });

  it('blocks admin/support/lifter/trainer/owner case-insensitively', async () => {
    for (const username of ['Admin', 'SUPPORT', 'lifter', 'TRAINER', 'Owner']) {
      const fixture = await signupFixture(f);
      expect(
        await signup(db, fixture, { ...fixture.fields, username }),
      ).toEqual({ status: 'username_unavailable' });
    }
  });

  it('enforces case-insensitive uniqueness per workspace and allows the name in another workspace', async () => {
    const name = syntheticUsername('dup');
    const first = await signupFixture(f);
    expect(
      await signup(db, first, { ...first.fields, username: name }),
    ).toEqual({ status: 'complete' });
    const sameWorkspace = await signupFixture(f);
    expect(
      await signup(db, sameWorkspace, {
        ...sameWorkspace.fields,
        username: name.toUpperCase(),
      }),
    ).toEqual({ status: 'username_unavailable' });
    const otherWorkspace = await signupFixture(inWorkspaceB(f));
    expect(
      await signup(db, otherWorkspace, {
        ...otherWorkspace.fields,
        username: name.toUpperCase(),
      }),
    ).toEqual({ status: 'complete' });
  });
});

describe('later client edit', () => {
  it('updates only the caller, lowercases, and audits without the value', async () => {
    const client = await leaderboardClient(f);
    const next = syntheticUsername('Edit').toUpperCase();
    const result = await client.client.rpc('client_update_username', {
      p_username: next,
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ status: 'updated' });
    const [row] =
      await db`select username_normalized from public.clients where id=${client.clientId}`;
    expect(row?.username_normalized).toBe(next.toLowerCase());
    const audits = await db`
      select actor_user_id, details from public.audit_events
      where action='client.username_changed' and target_id=${client.clientId}
      order by id`;
    expect(audits.length).toBeGreaterThanOrEqual(1);
    for (const audit of audits) {
      expect(audit.actor_user_id).toBe(client.userId);
      expect(audit.details).toEqual({});
    }
    expect(
      (
        await client.client.rpc('client_update_username', {
          p_username: next.toLowerCase(),
        })
      ).data,
    ).toEqual({ status: 'unchanged' });
  });

  it('returns the Q14 reason for each invalid value', async () => {
    const client = await leaderboardClient(f);
    const cases: Array<[string, string]> = [
      ['ab', 'too_short'],
      ['a'.repeat(21), 'too_long'],
      ['bad-name', 'invalid_chars'],
      ['Admin', 'reserved'],
      ['s.u.p.p.o.r.t', 'reserved'],
    ];
    for (const [value, status] of cases)
      expect(
        (
          await client.client.rpc('client_update_username', {
            p_username: value,
          })
        ).data,
      ).toEqual({ status });
  });

  it('refuses a name already used in the same workspace (any case) but allows it in another', async () => {
    const owner = await leaderboardClient(f);
    const other = await leaderboardClient(f);
    expect(
      (
        await other.client.rpc('client_update_username', {
          p_username: owner.username.toUpperCase(),
        })
      ).data,
    ).toEqual({ status: 'taken' });
    const foreign = await leaderboardClient(f, { workspace: 'B' });
    expect(
      (
        await foreign.client.rpc('client_update_username', {
          p_username: owner.username,
        })
      ).data,
    ).toEqual({ status: 'updated' });
  });

  it('lets exactly one of two concurrent same-workspace claims win', async () => {
    const left = await leaderboardClient(f);
    const right = await leaderboardClient(f);
    const contested = syntheticUsername('race');
    const results = await Promise.all(
      [left, right].map((client) =>
        client.client.rpc('client_update_username', {
          p_username: contested,
        }),
      ),
    );
    expect(results.map((result) => result.data?.status).sort()).toEqual([
      'taken',
      'updated',
    ]);
  });

  it('denies staff, anonymous and direct-table edits', async () => {
    const target = await leaderboardClient(f);
    expect(
      (
        await f.trainerA.client.rpc('client_update_username', {
          p_username: syntheticUsername(),
        })
      ).data,
    ).toEqual({ status: 'not_permitted' });
    const anonymous = await anonClient().rpc('client_update_username', {
      p_username: syntheticUsername(),
    });
    expect(anonymous.error).not.toBeNull();
    const direct = await target.client
      .from('clients')
      .update({ username_normalized: syntheticUsername() })
      .eq('id', target.clientId);
    expect(direct.error).not.toBeNull();
  });
});

describe('database guard (HIGH-RISK mutation evidence, T010)', () => {
  async function rawUsernameUpdate(
    tx: TransactionSql,
    clientId: string,
    userId: string,
  ) {
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
    await tx`update public.clients set username_normalized=${syntheticUsername('raw')} where id=${clientId}`;
  }

  it('rejects a username update without the in-transaction change marker', async () => {
    const client = await leaderboardClient(f);
    await expect(
      db.begin((tx) => rawUsernameUpdate(tx, client.clientId, client.userId)),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('mutation: removing the marker check lets the raw update through (kill), restored by rollback', async () => {
    const client = await leaderboardClient(f);
    const rollback = new Error('rollback guard mutation');
    let applied = false;
    try {
      await db.begin(async (tx) => {
        const [row] = await tx`
          select pg_get_functiondef('app_private.f12_guard_client_transition()'::regprocedure) as definition`;
        const definition = row!.definition as string;
        const mutated = definition.replace(
          'or not exists(select 1 from app_private.client_username_changes u',
          'or false and exists(select 1 from app_private.client_username_changes u',
        );
        expect(mutated).not.toBe(definition);
        await tx.unsafe(mutated);
        await rawUsernameUpdate(tx, client.clientId, client.userId);
        applied = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(applied).toBe(true);
    const [definition] = await db`
      select pg_get_functiondef('app_private.f12_guard_client_transition()'::regprocedure) as body`;
    expect(definition?.body).toContain(
      'or not exists(select 1 from app_private.client_username_changes u',
    );
  });
});
