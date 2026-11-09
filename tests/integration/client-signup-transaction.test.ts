import { afterAll, beforeAll, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import { RESERVED_SIGNUP_ROLE_NAMES } from '../../lib/forms/signup-policy';
import { anonClient } from './harness';
import {
  clientContext,
  signup,
  signupFixture,
  sql,
  type ClientContext,
} from './client-accounts-fixture';

let context: ClientContext;
const db = sql();

beforeAll(async () => {
  context = await clientContext();
});

afterAll(() => db.end());

async function runSignupMutation<T>(
  fixture: Awaited<ReturnType<typeof signupFixture>>,
  mutate: (definition: string, tx: TransactionSql) => Promise<string>,
  run: (tx: TransactionSql) => Promise<T>,
) {
  const rollback = new Error('rollback signup mutation');
  let result: T | undefined;
  try {
    await db.begin(async (tx) => {
      const [row] = await tx`
        select pg_get_functiondef('public.client_signup(text,text,uuid,jsonb)'::regprocedure) as definition`;
      const changed = await mutate(row!.definition as string, tx);
      if (changed === row!.definition)
        throw new Error('Mutation did not apply');
      await tx.unsafe(changed);
      result = await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return result;
}

function extendedFields(fixture: Awaited<ReturnType<typeof signupFixture>>) {
  return {
    ...fixture.fields,
    name: 'Client Example Synthetic',
    date_of_birth: '1990-04-12',
    username: `Ｆit.Client.${fixture.link.replaceAll('-', '').slice(0, 8)}`,
    telegram_username: '@FitClient_1',
  };
}

it('atomically stores the normalized profile, consumes the link once, and leaves the account pending without consent or session', async () => {
  const fixture = await signupFixture(context);
  const fields = extendedFields(fixture);

  expect(await signup(db, fixture, fields)).toEqual({ status: 'complete' });

  const [client] = await db`
    select c.*, u.email_confirmed_at is not null as confirmed
    from public.clients c
    join auth.users u on u.id=c.auth_user_id
    where c.registration_link_id=${fixture.link}`;
  expect(client).toMatchObject({
    username_normalized: fields.username.normalize('NFKC').toLowerCase(),
    telegram_username: fields.telegram_username,
    approval_state: 'pending-approval',
    confirmed: true,
  });
  expect(
    new Date(client!.date_of_birth as string).toISOString().slice(0, 10),
  ).toBe(fields.date_of_birth);
  expect(
    await db`select 1 from auth.sessions where user_id=${client!.auth_user_id}`,
  ).toHaveLength(0);
  expect(
    await db`select 1 from app_private.terms_consent_receipts where client_id=${client!.id}`,
  ).toHaveLength(0);
  expect(
    await db`select 1 from public.registration_links where id=${fixture.link} and consumed_at is not null`,
  ).toHaveLength(1);

  const clientSession = anonClient();
  const signedIn = await clientSession.auth.signInWithPassword({
    email: fixture.fields.email,
    password: fixture.fields.password,
  });
  expect(signedIn.error).toBeNull();
  expect((await clientSession.from('clients').select('id')).data).toBeNull();
  expect(await signup(db, fixture, fields)).toEqual({ status: 'invalid' });
  expect(
    await db`select count(*)::integer as count from public.clients where registration_link_id=${fixture.link}`,
  ).toMatchObject([{ count: 1 }]);
});

it('rolls back profile, Auth identity, and link consumption together on a later business failure', async () => {
  const fixture = await signupFixture(context);
  const fields = extendedFields(fixture);

  await db
    .begin(async (tx) => {
      await tx.unsafe(
        `create function pg_temp.f15_signup_fail() returns trigger language plpgsql as $$ begin raise exception 'synthetic business failure' using errcode='P1100'; end $$`,
      );
      await tx.unsafe(
        'create trigger f15_signup_fail before insert on app_private.client_signup_operations for each row execute function pg_temp.f15_signup_fail()',
      );
      expect(await signup(tx, fixture, fields)).toEqual({ status: 'invalid' });
      expect(
        await tx`select 1 from auth.users where email=${fixture.fields.email}`,
      ).toHaveLength(0);
      expect(
        await tx`select 1 from auth.identities where identity_data->>'email'=${fixture.fields.email}`,
      ).toHaveLength(0);
      expect(
        await tx`select 1 from public.clients where registration_link_id=${fixture.link}`,
      ).toHaveLength(0);
      expect(
        await tx`select 1 from public.registration_links where id=${fixture.link} and consumed_at is not null`,
      ).toHaveLength(0);
      expect(
        await tx`select redeemed_at from app_private.signup_admission_tickets where id=${fixture.ticket}`,
      ).toHaveLength(1);
      throw new Error('rollback F15 signup probe');
    })
    .catch((error: unknown) => {
      if (
        !(error instanceof Error) ||
        error.message !== 'rollback F15 signup probe'
      )
        throw error;
    });

  const login = await anonClient().auth.signInWithPassword({
    email: fixture.fields.email,
    password: fixture.fields.password,
  });
  expect(login.error).not.toBeNull();
  expect(
    await db`select 1 from public.registration_links where id=${fixture.link} and consumed_at is not null`,
  ).toHaveLength(0);
});

it('rejects a reserved username before link redemption and normalizes compatibility forms server-side', async () => {
  const fixture = await signupFixture(context);
  const fields = extendedFields(fixture);

  expect(
    await signup(db, fixture, { ...fields, username: 'Ｐｌａｔｆｏｒｍ' }),
  ).toEqual({ status: 'invalid' });
  expect(
    await db`select redeemed_at from app_private.signup_admission_tickets where id=${fixture.ticket} and redeemed_at is not null`,
  ).toHaveLength(0);

  expect(await signup(db, fixture, fields)).toEqual({ status: 'complete' });
  const [client] = await db`
    select username_normalized
    from public.clients
    where registration_link_id=${fixture.link}`;
  expect(client?.username_normalized).toBe(
    fields.username.normalize('NFKC').toLowerCase(),
  );
});

it('keeps the SQL and TypeScript reserved-role username lists in parity', async () => {
  const [row] =
    await db`select app_private.signup_reserved_usernames() as names`;
  expect(row?.names).toEqual([...RESERVED_SIGNUP_ROLE_NAMES]);
});

it('rejects usernames outside the approved normalized set before admission redemption', async () => {
  for (const username of [
    ' Client.123',
    'Client.123 ',
    'Client\u200B123',
    'abc-def',
  ]) {
    const fixture = await signupFixture(context);
    expect(
      await signup(db, fixture, { ...extendedFields(fixture), username }),
    ).toEqual({ status: 'invalid' });
    expect(
      await db`select redeemed_at from app_private.signup_admission_tickets where id=${fixture.ticket} and redeemed_at is not null`,
    ).toHaveLength(0);
  }
});

it('mutation: skipping the normalized username character check permits a format-control bypass', async () => {
  const fixture = await signupFixture(context);
  const outcome = await runSignupMutation(
    fixture,
    async (definition) =>
      definition.replace(
        /if\s+normalized_username\s*!~\s*'[^']+'\s+then\s+return\s+'[^']+'::jsonb;\s+end if;/u,
        '-- format-control policy mutation',
      ),
    async (tx) =>
      signup(tx, fixture, {
        ...extendedFields(fixture),
        username: 'platform\u200B',
      }),
  );
  expect(outcome).toEqual({ status: 'complete' });
});

it('enforces name, past DOB, and optional Telegram syntax at the transaction boundary', async () => {
  const cairoToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const invalidProfiles = [
    {
      name: 'Client Example',
      date_of_birth: '1990-04-12',
      telegram_username: '',
    },
    { name: '\tClient Example\n' },
    { name: 'Client Example\t\n' },
    { date_of_birth: cairoToday },
    { date_of_birth: `${Number(cairoToday.slice(0, 4)) + 1}-01-01` },
    { telegram_username: 'not a valid handle' },
    { telegram_username: null },
  ];
  for (const patch of invalidProfiles) {
    const fixture = await signupFixture(context);
    const result = await signup(db, fixture, {
      ...extendedFields(fixture),
      ...patch,
    });
    expect(result).toEqual({ status: 'invalid' });
    expect(
      await db`select redeemed_at from app_private.signup_admission_tickets where id=${fixture.ticket} and redeemed_at is not null`,
    ).toHaveLength(0);
  }
});

it('mutation: dropping atomic link consumption is caught and rolled back', async () => {
  const fixture = await signupFixture(context);
  const outcome = await runSignupMutation(
    fixture,
    async (definition) => {
      const changed = definition.replace(
        /update public\.registration_links l set consumed_at=sampled_at[\s\S]*?if consumed is null then raise exception 'signup_invalid' using errcode='P1100'; end if;/u,
        '-- mutation removed single-use link consumption',
      );
      return changed;
    },
    async (tx) => {
      const result = await signup(tx, fixture, extendedFields(fixture));
      const [link] = await tx`
        select consumed_at from public.registration_links where id=${fixture.link}`;
      return { result, consumed: link?.consumed_at !== null };
    },
  );
  expect(outcome?.result.status).not.toBe('complete');
  expect(outcome?.consumed).toBe(false);
});

it('mutation: accepting a reserved username is caught and rolled back', async () => {
  const fixture = await signupFixture(context);
  const outcome = await runSignupMutation(
    fixture,
    async (definition, tx) => {
      const [reserved] = await tx`
        select pg_get_functiondef('app_private.signup_reserved_usernames()'::regprocedure) as definition`;
      const weakened = (reserved!.definition as string).replace(
        /select '\[[^']*\]'::jsonb/u,
        "select '[]'::jsonb",
      );
      await tx.unsafe(weakened);
      return definition.replace('begin', 'begin\n  -- reserved-name mutation');
    },
    async (tx) =>
      signup(tx, fixture, {
        ...extendedFields(fixture),
        username: 'Ｐｌａｔｆｏｒｍ',
      }),
  );
  expect(outcome).toEqual({ status: 'complete' });
});

it('mutation: skipping server NFKC normalization is caught and rolled back', async () => {
  const fixture = await signupFixture(context);
  const outcome = await runSignupMutation(
    fixture,
    async (definition) =>
      definition.replace(
        /normalized_username\s*:=\s*lower\(normalize\(fields->>'username',\s*NFKC\)\);/u,
        "normalized_username:=lower(fields->>'username');",
      ),
    async (tx) => signup(tx, fixture, extendedFields(fixture)),
  );
  expect(outcome).not.toEqual({ status: 'complete' });
});

it('mutation: creating a Terms receipt during signup is caught and rolled back', async () => {
  const fixture = await signupFixture(context);
  const outcome = await runSignupMutation(
    fixture,
    async (definition, tx) => {
      await tx`
        insert into app_private.terms_policy_versions(version,policy_kind,status)
        values('signup-mutation-terms','terms','published')`;
      return definition.replace(
        'insert into app_private.client_signup_operations(workspace_id,client_id,auth_user_id,registration_link_id,request_secret_hash)',
        `insert into app_private.terms_consent_receipts(workspace_id,client_id,policy_version) values(link.workspace_id,new_client,'signup-mutation-terms');\n    insert into app_private.client_signup_operations(workspace_id,client_id,auth_user_id,registration_link_id,request_secret_hash)`,
      );
    },
    async (tx) => {
      const result = await signup(tx, fixture, extendedFields(fixture));
      const receipts = await tx`
        select 1 from app_private.terms_consent_receipts where client_id=(select id from public.clients where registration_link_id=${fixture.link})`;
      return { result, receiptCount: receipts.length };
    },
  );
  expect(outcome).toEqual({ result: { status: 'complete' }, receiptCount: 1 });
});

it('stores DOB, normalized username and optional Telegram in the atomic signup', async () => {
  const fixture = await signupFixture(context);
  const fields: Record<string, string | null | undefined> = {
    ...fixture.fields,
    name: 'Heba Sami Nabil',
    date_of_birth: '1990-04-12',
    username: 'Fit.Client',
    telegram_username: '',
  };

  expect(await signup(db, fixture, fields)).toEqual({ status: 'complete' });

  const [client] = await db`
    select date_of_birth, username_normalized, telegram_username
    from public.clients where registration_link_id=${fixture.link}`;
  expect(client).toEqual({
    date_of_birth: new Date('1990-04-12T00:00:00.000Z'),
    username_normalized: 'fit.client',
    telegram_username: null,
  });

  const second = await signupFixture(context);
  const duplicateFields: Record<string, string | null | undefined> = {
    ...second.fields,
    name: 'Heba Sami Nabil',
    date_of_birth: '1990-04-12',
    username: 'FIT.CLIENT',
    telegram_username: '@Heba_Test1',
  };
  expect(await signup(db, second, duplicateFields)).toEqual({
    status: 'username_unavailable',
  });

  const otherWorkspace = await clientContext();
  const third = await signupFixture(otherWorkspace);
  const otherWorkspaceFields: Record<string, string | null | undefined> = {
    ...third.fields,
    name: 'Heba Sami Nabil',
    date_of_birth: '1990-04-12',
    username: 'fit.client',
    telegram_username: '',
  };
  expect(await signup(db, third, otherWorkspaceFields)).toEqual({
    status: 'complete',
  });

  const optionalTelegram = await signupFixture(context);
  const optionalFields: Record<string, string | null | undefined> = {
    ...optionalTelegram.fields,
    name: 'Heba Sami Nabil',
    date_of_birth: '1990-04-12',
    username: 'telegram_optional',
    telegram_username: '',
  };
  expect(await signup(db, optionalTelegram, optionalFields)).toEqual({
    status: 'complete',
  });
  const signedIn = await anonClient().auth.signInWithPassword({
    email: optionalTelegram.fields.email,
    password: optionalTelegram.fields.password,
  });
  expect(signedIn.error).toBeNull();
});

it('returns one generic username-unavailable result for reserved names and rejects invalid formats', async () => {
  const reserved = await signupFixture(context);
  const reservedFields = {
    ...reserved.fields,
    name: 'Heba Sami Nabil',
    date_of_birth: '1990-04-12',
    username: 'PLATFORM',
  };
  const invalidFields = {
    ...reserved.fields,
    name: 'Heba Sami Nabil',
    date_of_birth: '1990-04-12',
    username: 'ab',
  };

  const reservedResult = await signup(db, reserved, reservedFields);
  const formatResult = await signup(db, reserved, invalidFields);

  expect(reservedResult).toEqual({ status: 'username_unavailable' });
  expect(formatResult).toEqual({ status: 'invalid' });
});
