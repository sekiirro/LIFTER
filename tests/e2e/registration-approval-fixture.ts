import { randomUUID } from 'node:crypto';
import { admin, anonClient, sql } from '../integration/harness';
import { pending } from '../integration/client-accounts-fixture';
import {
  checked,
  issue,
  registrationFixture,
} from '../integration/registration-links-fixture';

/** Creates a local Stack A client and a pending approval row for UI journeys. */
export async function createPendingClient(
  installments:
    | readonly {
        seq: number;
        amount_minor: string;
        due_offset_days: number;
      }[]
    | null = null,
) {
  const base = await registrationFixture();
  const link = checked(
    await issue(base, base.po.client, { installments }),
  ) as string;
  const context = { ...base, link };
  const email = `f12-ui-${randomUUID()}@example.test`;
  const password = `Status!2345${randomUUID().slice(0, 8)}`;
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error('Could not create synthetic UI client');

  const db = sql();
  let target: Awaited<ReturnType<typeof pending>>;
  try {
    target = await db.begin((tx) =>
      pending(tx, context, {}, created.data.user.id),
    );
  } finally {
    await db.end();
  }

  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session)
    throw new Error('Synthetic UI client sign-in failed');
  return { context, target, client, email, password };
}
