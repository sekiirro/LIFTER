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
        await tx`select app_private.consume_f15_telegram_start(10001,${token},'10101') result`;
      const [replay] =
        await tx`select app_private.consume_f15_telegram_start(10001,${token},'10101') result`;
      expect(first!.result).toBe(true);
      expect(replay!.result).toBe(false);
      const expired = randomUUID()
        .replaceAll('-', '')
        .padEnd(64, 'b')
        .slice(0, 64);
      await tx`insert into app_private.f15_telegram_link_tokens(token_hash,user_id,expires_at)
      values(extensions.digest(${expired},'sha256'),${f.trainerA.userId},clock_timestamp()-interval '1 second')`;
      const [expiredResult] =
        await tx`select app_private.consume_f15_telegram_start(10002,${expired},'10101') result`;
      expect(expiredResult!.result).toBe(false);
      const [revokedMembership] =
        await tx`select workspace_id from public.workspace_memberships
      where user_id=${f.trainerA.userId} and revoked_at is null limit 1`;
      expect(revokedMembership, 'trainer fixture membership').toBeDefined();
      await tx`update public.workspace_memberships set revoked_at=clock_timestamp(),revoked_by=${f.po.userId}
        where workspace_id=${revokedMembership!.workspace_id} and user_id=${f.trainerA.userId}`;
      const [link] =
        await tx`select revoked_at from app_private.f15_telegram_links where user_id=${f.trainerA.userId}`;
      expect(link, 'linked Telegram row').toBeDefined();
      expect(link!.revoked_at).not.toBeNull();

      const relinkToken = randomUUID()
        .replaceAll('-', '')
        .padEnd(64, 'c')
        .slice(0, 64);
      await tx`insert into app_private.f15_telegram_link_tokens(token_hash,user_id,expires_at)
        values(extensions.digest(${relinkToken},'sha256'),${f.trainerB.userId},clock_timestamp()+interval '10 minutes')`;
      const [relinked] = await tx`
        select app_private.consume_f15_telegram_start(10003,${relinkToken},'10101') result
      `;
      expect(relinked?.result).toBe(true);
      const [newOwner] = await tx`
        select user_id,revoked_at from app_private.f15_telegram_links
        where chat_id='10101' and revoked_at is null
      `;
      expect(newOwner).toMatchObject({
        user_id: f.trainerB.userId,
        revoked_at: null,
      });
      let revokedChatUniqueMutationKilled = false;
      await expect(
        tx.savepoint(async (sp) => {
          await sp`delete from app_private.f15_telegram_links
            where user_id=${f.trainerB.userId}`;
          await sp`drop index app_private.f15_telegram_links_active_chat_id_unique`;
          await sp`alter table app_private.f15_telegram_links
            add constraint f15_telegram_links_chat_id_key unique(chat_id)`;
          const mutantToken = randomUUID()
            .replaceAll('-', '')
            .padEnd(64, 'd')
            .slice(0, 64);
          await sp`insert into app_private.f15_telegram_link_tokens(
            token_hash,user_id,expires_at
          ) values(
            extensions.digest(${mutantToken},'sha256'),${f.trainerB.userId},
            clock_timestamp()+interval '10 minutes'
          )`;
          try {
            const [mutant] = await sp.savepoint(
              async (probe) =>
                probe`select app_private.consume_f15_telegram_start(
                10004,${mutantToken},'10101'
              ) result`,
            );
            expect(mutant?.result).toBe(true);
          } catch {
            revokedChatUniqueMutationKilled = true;
          }
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(revokedChatUniqueMutationKilled).toBe(true);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
