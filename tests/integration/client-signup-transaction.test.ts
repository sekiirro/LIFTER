import { afterAll, beforeAll, expect, it } from 'vitest';
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
