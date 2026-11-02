import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { clientContext, sql } from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('rollback Telegram link fixture');

it('consumes a short-lived hashed token once and revokes a link on membership loss', async () => {
  await expect(
    db.begin(async (tx) => {
      const f = await clientContext();
      const token = randomUUID()
        .replaceAll('-', '')
        .padEnd(64, 'a')
        .slice(0, 64);
      await tx`insert into app_private.f15_telegram_link_tokens(token_hash,user_id,expires_at)
      values(extensions.digest(${token},'sha256'),${f.trainerA.userId},clock_timestamp()+interval '10 minutes')`;
      const [first] =
        await tx`select app_private.consume_f15_telegram_link_token(${token},'10101') result`;
      const [replay] =
        await tx`select app_private.consume_f15_telegram_link_token(${token},'10101') result`;
      expect(first!.result).toBe(true);
      expect(replay!.result).toBe(false);
      const expired = randomUUID()
        .replaceAll('-', '')
        .padEnd(64, 'b')
        .slice(0, 64);
      await tx`insert into app_private.f15_telegram_link_tokens(token_hash,user_id,expires_at)
      values(extensions.digest(${expired},'sha256'),${f.trainerA.userId},clock_timestamp()-interval '1 second')`;
      const [expiredResult] =
        await tx`select app_private.consume_f15_telegram_link_token(${expired},'10101') result`;
      expect(expiredResult!.result).toBe(false);
      const [revokedMembership] =
        await tx`select workspace_id from public.workspace_memberships
      where user_id=${f.trainerA.userId} and revoked_at is null limit 1`;
      if (revokedMembership) {
        await tx`update public.workspace_memberships set revoked_at=clock_timestamp(),revoked_by=${f.po.userId}
        where workspace_id=${revokedMembership.workspace_id} and user_id=${f.trainerA.userId}`;
        const [link] =
          await tx`select revoked_at from app_private.f15_telegram_links where user_id=${f.trainerA.userId}`;
        expect(link!.revoked_at).not.toBeNull();
      }
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
