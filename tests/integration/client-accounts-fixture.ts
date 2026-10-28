import { randomBytes, randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { sql } from './harness';
import {
  checked,
  backdated,
  issue,
  registrationFixture,
} from './registration-links-fixture';
export { registrationFixture } from './registration-links-fixture';
export { sql } from './harness';

export const modelTables = [
  'public.clients',
  'app_private.account_identifier_claims',
  'app_private.client_signup_operations',
  'app_private.client_signup_attempts',
  'app_private.signup_admission_tickets',
] as const;
export const rollback = new Error('U2 synthetic rollback');
export async function probe(body: (tx: TransactionSql) => Promise<void>) {
  const db = sql();
  try {
    await db.begin(async (tx) => {
      await body(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await db.end();
  }
}
export async function identity(
  tx: TransactionSql,
  patch: Record<string, unknown> = {},
) {
  const row = {
    id: randomUUID(),
    email: `u2-${randomUUID()}@example.test`,
    ...patch,
  };
  await tx`insert into auth.users ${tx(row)}`;
  return row;
}
export async function ticket(tx: TransactionSql) {
  const binding = randomBytes(32);
  const request = randomBytes(32);
  const [row] =
    await tx`insert into app_private.signup_admission_tickets(link_key,request_secret_hash) values(${binding},${request}) returning id`;
  return { id: row!.id as string, binding, request };
}

export async function clientContext() {
  const f = await registrationFixture();
  const link = checked(await issue(f)) as string;
  return { ...f, link };
}
export type ClientContext = Awaited<ReturnType<typeof clientContext>>;
export async function pending(
  tx: TransactionSql,
  f: ClientContext,
  patch: Record<string, unknown> = {},
  userId?: string,
) {
  const user = userId ? { id: userId } : await identity(tx);
  await tx`select set_config('request.jwt.claims','{}',true)`;
  const [row] = await tx`insert into public.clients ${tx({
    workspace_id: f.wsA.id,
    auth_user_id: user.id,
    registration_link_id: f.link,
    package_version_id: f.p.versionId,
    email_normalized: 'IGNORED@example.test',
    phone_e164:
      '+201' +
      BigInt('0x' + randomBytes(5).toString('hex'))
        .toString()
        .padStart(13, '0')
        .slice(-11),
    name: 'U2 synthetic',
    ...patch,
  })} returning *`;
  await tx`update public.registration_links set consumed_at=now() where id=${f.link}`;
  return row!;
}

// U3 synthetic pre-admission only; U5 owns public issuance.
export async function signupFixture(f: ClientContext, executor = sql()) {
  const request = randomBytes(32).toString('base64url');
  const {
    token,
    hash,
    id: link,
  } = await backdated(f, new Date(Date.now() + 86_400_000).toISOString());
  try {
    const [t] =
      await executor`insert into app_private.signup_admission_tickets(link_key,request_secret_hash,workspace_id,link_id)
      select extensions.hmac(convert_to('lifter.f11.link.v1','UTF8')||decode('00','hex')||int4send(octet_length(${hash}::text))||convert_to(${hash},'UTF8'),decode(decrypted_secret,'hex'),'sha256'),extensions.digest(${request},'sha256'),${f.wsA.id},${link}
      from vault.decrypted_secrets where name='SIGNUP_RATE_KEY' returning id`;
    if (!t) throw new Error('Synthetic admission unavailable');
    return {
      token,
      request,
      hash,
      link,
      ticket: t.id as string,
      fields: {
        name: 'U3 synthetic',
        email: `u3-${randomUUID()}@example.test`,
        phone:
          '+201' +
          BigInt('0x' + randomBytes(5).toString('hex'))
            .toString()
            .padStart(11, '0')
            .slice(-11),
        password: 'Synthetic9!' + randomUUID().replaceAll('-', ''),
      },
    };
  } finally {
    await executor.end();
  }
}
export type SignupFixture = Awaited<ReturnType<typeof signupFixture>>;
export async function signup(
  tx: TransactionSql | ReturnType<typeof sql>,
  f: SignupFixture,
  fields = f.fields,
) {
  // Never let a provider diagnostic print statement parameters or credentials.
  try {
    const [row] =
      await tx`select public.client_signup(${f.token},${f.request},${f.ticket},${tx.json(fields)}) as result`;
    return row!.result;
  } catch (error) {
    throw new Error(
      'Signup SQL failed: ' + String((error as { code?: string }).code),
    );
  }
}
