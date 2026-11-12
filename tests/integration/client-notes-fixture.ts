import { randomUUID } from 'node:crypto';
import { anonClient, sql } from './harness';
import {
  clientContext,
  identity,
  type ClientContext,
} from './client-accounts-fixture';

export type ClientNotesFixture = {
  context: ClientContext;
  workspaceId: string;
  clientId: string;
  db: ReturnType<typeof sql>;
  close: () => Promise<void>;
  key: () => string;
  createAsTrainer: (input: {
    body: string;
    key?: string;
  }) => Promise<Record<string, unknown>>;
  createAs: (
    actor: ClientContext['trainerA'],
    body: string,
    key?: string,
  ) => Promise<{ data: unknown; error: unknown }>;
  countNotes: () => Promise<number>;
  rawInsertNote: (input: { key: string; body: string }) => Promise<unknown>;
  readNote: (
    actor: ClientContext['trainerA'],
    id: string,
  ) => Promise<{ data: unknown[] | null; error: unknown }>;
  keyRecordHasBodyColumn: () => Promise<boolean>;
};

export async function clientNotesFixture(): Promise<ClientNotesFixture> {
  const context = await clientContext();
  const db = sql();
  const [client] = await db.begin(async (tx) => {
    await tx`alter table public.clients disable trigger signup_client_insert_guard`;
    await tx`alter table public.clients disable trigger signup_client_integrity`;
    await tx`alter table public.clients disable trigger audit_client_signup`;
    try {
      const user = await identity(tx);
      const phone =
        '+201' +
        BigInt('0x' + randomUUID().replaceAll('-', '').slice(0, 10))
          .toString()
          .padStart(10, '0')
          .slice(-10);
      const [row] = await tx`
        insert into public.clients (
          workspace_id, auth_user_id, registration_link_id,
          package_version_id, email_normalized, phone_e164, name
        ) values (
          ${context.wsA.id}, ${user.id}, ${context.link}, ${context.p.versionId},
          ${user.email}, ${phone}, 'Client Notes test client'
        ) returning id, workspace_id
      `;
      await tx`alter table public.clients enable trigger signup_client_insert_guard`;
      await tx`alter table public.clients enable trigger signup_client_integrity`;
      await tx`alter table public.clients enable trigger audit_client_signup`;
      return [row];
    } catch (error) {
      await tx`alter table public.clients enable trigger signup_client_insert_guard`;
      await tx`alter table public.clients enable trigger signup_client_integrity`;
      await tx`alter table public.clients enable trigger audit_client_signup`;
      throw error;
    }
  });
  if (!client) throw new Error('Synthetic Client Notes client missing');

  const createAs = async (
    actor: ClientContext['trainerA'],
    body: string,
    key: string = randomUUID(),
  ) =>
    actor.client.rpc('create_client_note', {
      p_workspace_id: context.wsA.id,
      p_client_id: client.id,
      p_body: body,
      p_idempotency_key: key,
    });

  return {
    context,
    workspaceId: client.workspace_id as string,
    clientId: client.id as string,
    db,
    close: () => db.end(),
    key: () => randomUUID(),
    async createAsTrainer({ body, key = randomUUID() }) {
      const result = await createAs(context.trainerA, body, key);
      if (result.error) {
        const error = result.error as { code?: string; message?: string };
        throw new Error(
          `Client note create RPC failed (${error.code ?? 'unknown'}: ${error.message ?? 'unknown'})`,
        );
      }
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row || typeof row !== 'object')
        throw new Error('Client note create returned no row');
      return row as Record<string, unknown>;
    },
    createAs: (actor, body, key) => createAs(actor, body, key),
    async countNotes() {
      const [row] = await db`
        select count(*)::int as count
        from public.client_notes
        where workspace_id = ${client.workspace_id}
          and client_id = ${client.id}
      `;
      return Number(row?.count ?? 0);
    },
    async rawInsertNote({ key, body }) {
      const [row] = await db`
        insert into public.client_notes (
          workspace_id, client_id, author_user_id, body, idempotency_key
        ) values (
          ${client.workspace_id}, ${client.id}, ${context.trainerA.userId},
          ${body}, ${key}
        ) returning id
      `;
      return row;
    },
    async readNote(actor, id) {
      return (await actor.client
        .from('client_notes')
        .select(
          'id,workspace_id,client_id,author_user_id,body,created_at,edited_at',
        )
        .eq('id', id)) as { data: unknown[] | null; error: unknown };
    },
    async keyRecordHasBodyColumn() {
      const [row] = await db`
        select exists (
          select 1 from information_schema.columns
          where table_schema = 'app_private'
            and table_name = 'client_note_create_keys'
            and column_name in ('body', 'note_text')
        ) as has_body
      `;
      return Boolean(row?.has_body);
    },
  };
}

export { anonClient, sql };
