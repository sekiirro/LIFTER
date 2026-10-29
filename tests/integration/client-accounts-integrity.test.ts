import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { localSupabaseContainer } from '../../scripts/local-stack.mjs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  clientContext,
  identity,
  modelTables,
  pending,
  probe,
  sql,
  ticket,
  type ClientContext,
} from './client-accounts-fixture';
import { checked, issue } from './registration-links-fixture';
let context: ClientContext;
let isolated: ClientContext;
let spareLink: string;
beforeAll(async () => {
  context = await clientContext();
  isolated = await clientContext();
  spareLink = checked(await issue(isolated)) as string;
});

for (const field of [
  'id',
  'auth_user_id',
  'registration_link_id',
  'email_normalized',
  'phone_e164',
])
  it(`client ${field} UNIQUE rejects independently of claim/insert/deferred guards`, async () => {
    await probe(async (tx) => {
      const original = await pending(tx, isolated);
      const user = await identity(tx);
      const clone: Record<string, unknown> = {
        ...original,
        id: randomUUID(),
        auth_user_id: user.id,
        registration_link_id: spareLink,
        email_normalized: `unique-${randomUUID()}@example.test`,
        phone_e164: '+2019999999999',
      };
      clone[field] = original[field];
      await tx`set constraints all immediate`;
      await tx`alter table public.clients disable trigger signup_client_insert_guard`;
      await tx`alter table public.clients disable trigger signup_client_integrity`;
      await expect(
        tx.savepoint(async (inner) => {
          await inner`insert into public.clients ${inner(clone)}`;
        }),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });
for (const field of [
  'workspace_id',
  'auth_user_id',
  'registration_link_id',
  'package_version_id',
])
  it(`client ${field} FK rejects independently of insert guard and uniqueness`, async () => {
    await probe(async (tx) => {
      const original = await pending(tx, isolated);
      const user = await identity(tx);
      const clone = {
        ...original,
        id: randomUUID(),
        auth_user_id: user.id,
        registration_link_id: spareLink,
        email_normalized: `fk-${randomUUID()}@example.test`,
        phone_e164: '+2019999999998',
        [field]: randomUUID(),
      };
      await tx`set constraints all immediate`;
      await tx`alter table public.clients disable trigger signup_client_insert_guard`;
      await tx`alter table public.clients disable trigger signup_client_integrity`;
      await expect(
        tx.savepoint(async (inner) => {
          await inner`insert into public.clients ${inner(clone)}`;
        }),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });
const db = sql();
afterAll(() => db.end());

it('clients: every required field is NOT NULL, generated id/time and pending-only state', async () => {
  const columns =
    await db`select attname,attnotnull from pg_attribute where attrelid=to_regclass('public.clients') and attnum>0 and not attisdropped order by attnum`;
  expect(columns.map((c) => c.attname).sort()).toEqual(
    [
      'id',
      'workspace_id',
      'auth_user_id',
      'registration_link_id',
      'package_version_id',
      'email_normalized',
      'phone_e164',
      'name',
      'approval_state',
      'created_at',
    ].sort(),
  );
  expect(columns.every((c) => c.attnotnull)).toBe(true);
});
for (const [table, fragments] of [
  [
    'public.clients',
    [
      'PRIMARY KEY (id)',
      'UNIQUE (workspace_id, id)',
      'UNIQUE (auth_user_id)',
      'UNIQUE (registration_link_id)',
      'UNIQUE (email_normalized)',
      'UNIQUE (phone_e164)',
      'FOREIGN KEY (workspace_id)',
      'FOREIGN KEY (auth_user_id)',
      'FOREIGN KEY (workspace_id, registration_link_id)',
      'FOREIGN KEY (workspace_id, package_version_id)',
      'FOREIGN KEY (workspace_id, registration_link_id, package_version_id)',
    ],
  ],
  [
    'app_private.account_identifier_claims',
    [
      'PRIMARY KEY (auth_user_id)',
      'UNIQUE (email_key)',
      'UNIQUE (phone_key)',
      'REFERENCES auth.users(id) ON DELETE RESTRICT',
    ],
  ],
  [
    'app_private.client_signup_operations',
    [
      'UNIQUE (workspace_id, id)',
      'UNIQUE (registration_link_id)',
      'UNIQUE (auth_user_id)',
      'FOREIGN KEY (workspace_id, client_id)',
      'FOREIGN KEY (workspace_id, registration_link_id)',
    ],
  ],
] as const) {
  for (const fragment of fragments)
    it(`${table}: ${fragment}`, async () => {
      const constraints =
        await db`select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid=to_regclass(${table})`;
      expect(constraints.some((c) => c.definition.includes(fragment))).toBe(
        true,
      );
    });
}

it('normalization owns email case folding without trim and canonical stored E.164 only', async () => {
  const [row] =
    await db`select * from app_private.signup_identity_normalization('UPPER+Label@EXAMPLE.TEST','+201000000001')`;
  expect(row).toEqual({
    email_key: 'upper+label@example.test',
    phone_key: '+201000000001',
  });
  for (const phone of [
    '01000000001',
    '201000000001',
    '+020100000001',
    '+20 1000000001',
  ]) {
    await expect(
      db`select * from app_private.signup_identity_normalization('a@example.test',${phone})`,
    ).rejects.toMatchObject({ code: '23514' });
  }
});

for (const [name, expected] of [
  [
    'signup_password_policy',
    {
      minimum_code_points: 8,
      maximum_utf8_bytes: 72,
      digit_required: true,
      symbol: 'printable non-letter/non-digit/non-whitespace',
      normalization: false,
      nul_allowed: false,
    },
  ],
  [
    'signup_field_contract',
    {
      required: ['name', 'email', 'phone', 'password'],
      telegram: false,
      phone_input_format: null,
    },
  ],
  [
    'signup_consumption_policy',
    { strict: true, grace: false, f10_open_unchanged: true },
  ],
  [
    'client_signup_limits',
    {
      link_limit: 5,
      link_window_seconds: 900,
      ip_limit: 30,
      ip_window_seconds: 3600,
      fixed_windows: true,
      every_admission_counts: true,
    },
  ],
  [
    'signup_completion_policy',
    {
      state: 'pending-approval',
      client_access: false,
      session: false,
      approval_feature: 'F12',
      completion: 'generic',
    },
  ],
  [
    'signup_retention_policy',
    {
      attempt_days: 30,
      counter_retention: 'window_end',
      audit_retention: null,
    },
  ],
  [
    'signup_authenticated_visitor_policy',
    {
      manual_sign_out: true,
      auto_sign_out: false,
      link: false,
      merge: false,
      token_redirect: false,
    },
  ],
  [
    'signup_identifier_scope_policy',
    {
      global_unique: true,
      states: ['active', 'pending-approval'],
      archived_state: null,
      archived_review: null,
      duplicate_response: 'D-08',
      release: null,
    },
  ],
  [
    'client_signup_audit_contract',
    {
      events: ['attempt', 'failure', 'success', 'consumption', 'cleanup'],
      allowed_details: [
        'outcome_class',
        'timestamp',
        'link_id',
        'workspace_id',
      ],
      cleanup_details: ['count'],
      public_actor: null,
    },
  ],
] as const)
  it(`${name} owns the decided policy and leaves open sub-decisions unset`, async () => {
    const [row] = await db.unsafe(`select app_private.${name}() as policy`);
    expect(row!.policy).toEqual(expected);
  });
it('all Auth identities are backfilled and subsequent Auth writes synchronize claims', async () => {
  expect(
    await db`select u.id from auth.users u left join app_private.account_identifier_claims c on c.auth_user_id=u.id where c.auth_user_id is null`,
  ).toHaveLength(0);
  await probe(async (tx) => {
    const user = await identity(tx);
    const [claim] =
      await tx`select email_key,phone_key from app_private.account_identifier_claims where auth_user_id=${user.id}`;
    expect(claim).toEqual({ email_key: user.email, phone_key: null });
    await tx`update auth.users set email=${`changed-${randomUUID()}@example.test`} where id=${user.id}`;
    await tx`set constraints all immediate`;
  });
});
it('claims reject arbitrary privileged reassignment, deletion and update', async () => {
  for (const mutation of [
    'update app_private.account_identifier_claims set email_key=null',
    'delete from app_private.account_identifier_claims',
  ]) {
    await expect(
      probe(async (tx) => {
        await identity(tx);
        await tx.unsafe(mutation);
      }),
    ).rejects.toMatchObject({ code: '23514' });
  }
});
it('attempts contain only safe evidence, immutable UPDATE/DELETE', async () => {
  const columns =
    await db`select column_name from information_schema.columns where table_schema='app_private' and table_name='client_signup_attempts' order by ordinal_position`;
  expect(columns.map((r) => r.column_name).sort()).toEqual(
    ['id', 'outcome_class', 'created_at', 'workspace_id', 'link_id'].sort(),
  );
  for (const mutation of [
    'update app_private.client_signup_attempts set outcome_class=outcome_class',
    'delete from app_private.client_signup_attempts',
  ]) {
    await expect(
      probe(async (tx) => {
        await tx`insert into app_private.client_signup_attempts(outcome_class) values('invalid')`;
        await tx.unsafe(mutation);
      }),
    ).rejects.toMatchObject({ code: '23514' });
  }
});
it('attempt resolved workspace/link are both NULL or both supplied', async () => {
  await expect(
    probe(async (tx) => {
      await tx`insert into app_private.client_signup_attempts(outcome_class,workspace_id) values('invalid',${randomUUID()})`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
});
it('tickets bind link and request hash, reject replay and direct redemption update', async () => {
  await probe(async (tx) => {
    const t = await ticket(tx);
    const [wrong] =
      await tx`select app_private.redeem_signup_admission_ticket(${t.id},${Buffer.alloc(32)},${t.request}) as ok`;
    expect(wrong!.ok).toBe(false);
    const [ok] =
      await tx`select app_private.redeem_signup_admission_ticket(${t.id},${t.binding},${t.request}) as ok`;
    expect(ok!.ok).toBe(true);
    const [replay] =
      await tx`select app_private.redeem_signup_admission_ticket(${t.id},${t.binding},${t.request}) as ok`;
    expect(replay!.ok).toBe(false);
  });
  await expect(
    probe(async (tx) => {
      const t = await ticket(tx);
      await tx`update app_private.signup_admission_tickets set redeemed_at=now() where id=${t.id}`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
});
it('business inner savepoint failure retains ticket redemption; infrastructure rollback restores it', async () => {
  let t!: Awaited<ReturnType<typeof ticket>>;
  await db.begin(async (tx) => {
    t = await ticket(tx);
  });
  await expect(
    db.begin(async (tx) => {
      await tx`select app_private.redeem_signup_admission_ticket(${t.id},${t.binding},${t.request})`;
      throw new Error('synthetic infrastructure failure');
    }),
  ).rejects.toThrow('synthetic infrastructure failure');
  await db.begin(async (tx) => {
    const [row] =
      await tx`select app_private.redeem_signup_admission_ticket(${t.id},${t.binding},${t.request}) as ok`;
    expect(row!.ok).toBe(true);
    await expect(
      tx.savepoint(async (inner) => {
        await inner`select 1/0`;
      }),
    ).rejects.toMatchObject({ code: '22012' });
  });
  const [row] =
    await db`select redeemed_at is not null as redeemed from app_private.signup_admission_tickets where id=${t.id}`;
  expect(row!.redeemed).toBe(true);
});
it('two real connections redeem exactly once', async () => {
  const other = sql();
  try {
    let t!: Awaited<ReturnType<typeof ticket>>;
    await db.begin(async (tx) => {
      t = await ticket(tx);
    });
    const results = await Promise.all(
      [db, other].map((connection) =>
        connection.begin(async (tx) => {
          const [row] =
            await tx`select app_private.redeem_signup_admission_ticket(${t.id},${t.binding},${t.request}) as ok`;
          return row!.ok;
        }),
      ),
    );
    expect(results.sort()).toEqual([false, true]);
  } finally {
    await other.end();
  }
});

it('resolved tickets require exact workspace/link as well as link key and request hash', async () => {
  await probe(async (tx) => {
    const t = await ticket(tx);
    await tx`update app_private.signup_admission_tickets set link_id=link_id where false`;
    const [bound] =
      await tx`insert into app_private.signup_admission_tickets(link_key,request_secret_hash,workspace_id,link_id) values(${t.binding},${t.request},${context.wsA.id},${context.link}) returning id`;
    const [wrong] =
      await tx`select app_private.redeem_signup_admission_ticket(${bound!.id},${t.binding},${t.request},${context.wsB.id},${context.link}) as ok`;
    expect(wrong!.ok).toBe(false);
    const [wrongSecret] =
      await tx`select app_private.redeem_signup_admission_ticket(${bound!.id},${t.binding},${Buffer.alloc(32)},${context.wsA.id},${context.link}) as ok`;
    expect(wrongSecret!.ok).toBe(false);
    const [right] =
      await tx`select app_private.redeem_signup_admission_ticket(${bound!.id},${t.binding},${t.request},${context.wsA.id},${context.link}) as ok`;
    expect(right!.ok).toBe(true);
    await expect(
      tx.savepoint(async (inner) => {
        await inner`delete from app_private.signup_admission_tickets where id=${bound!.id}`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

for (const scenario of ['collision', 'unresolved'])
  it(`backfill ${scenario} aborts atomically without merging`, async () => {
    // Auth-owned trigger mutation requires the local platform owner (U1 pattern).
    // All inserts, trigger changes and the complete backfill replay roll back.
    const email = `backfill-${randomUUID()}@example.test`;
    const otherEmail =
      scenario === 'collision' ? email.toUpperCase() : `other-${email}`;
    const result = spawnSync(
      'docker',
      [
        'exec',
        '-i',
        localSupabaseContainer('db'),
        'psql',
        '-U',
        'supabase_admin',
        '-d',
        'postgres',
        '-Atq',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      {
        encoding: 'utf8',
        input: `
      begin;
      alter table auth.users disable trigger signup_auth_claim_sync;
      insert into auth.users(id,email,phone) values(gen_random_uuid(),'${email}',null),
        (gen_random_uuid(),'${otherEmail}',${scenario === 'collision' ? 'null' : "'unresolved'"});
      alter table app_private.account_identifier_claims disable trigger signup_no_truncate;
      truncate app_private.account_identifier_claims;
      alter table app_private.account_identifier_claims disable trigger signup_claim_write_guard;
      create temporary table before_backfill as select count(*) as n from auth.users;
      do $probe$
      declare rejected boolean:=false;
      begin
        begin
          insert into app_private.account_identifier_claims(auth_user_id,email_key,phone_key)
          select u.id,n.email_key,n.phone_key from auth.users u cross join lateral app_private.signup_identity_normalization(u.email,u.phone,true) n;
        exception when ${scenario === 'collision' ? 'unique_violation' : 'check_violation'} then rejected:=true;
        end;
        if not rejected then raise exception 'backfill should fail'; end if;
      end $probe$;
      select not exists(select 1 from app_private.account_identifier_claims)
        and (select n from before_backfill)=(select count(*) from auth.users);
      rollback;
    `,
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('t');
  });

it('all model tables have UPDATE, DELETE and TRUNCATE guards', async () => {
  for (const table of modelTables) {
    const [row] =
      await db`select bit_or(tgtype::int) as mask from pg_trigger where tgrelid=to_regclass(${table}) and not tgisinternal and tgenabled='O'`;
    expect((row?.mask ?? 0) & (8 | 16 | 32)).toBe(8 | 16 | 32);
  }
});

it('required name, server timestamp, pending-only state and E.164 cannot be bypassed', async () => {
  for (const patch of [
    { name: '' },
    { name: null },
    { created_at: '2000-01-01' },
    { approval_state: 'approved' },
    { phone_e164: '01000000000' },
    { phone_e164: '' },
  ]) {
    await expect(
      probe(async (tx) => {
        await pending(tx, context, patch);
      }),
    ).rejects.toMatchObject({ code: '23514' });
  }
});
it('client snapshot, identity and committed receipts are immutable and undeletable', async () => {
  for (const mutation of [
    'update public.clients set name=name',
    'delete from public.clients',
    'update app_private.client_signup_operations set created_at=now()',
    'delete from app_private.client_signup_operations',
  ]) {
    await expect(
      probe(async (tx) => {
        const c = await pending(tx, context);
        await tx`insert into app_private.client_signup_operations(workspace_id,client_id,auth_user_id,registration_link_id,request_secret_hash) values(${c.workspace_id},${c.id},${c.auth_user_id},${c.registration_link_id},${Buffer.alloc(32, 1)})`;
        await tx.unsafe(mutation);
      }),
    ).rejects.toMatchObject({ code: '23514' });
  }
});
it('foreign workspace and wrong issued package version are rejected independently', async () => {
  await expect(
    probe(async (tx) => {
      await pending(tx, context, { workspace_id: context.wsB.id });
    }),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    probe(async (tx) => {
      await pending(tx, context, { package_version_id: randomUUID() });
    }),
  ).rejects.toMatchObject({ code: '23514' });
});
it('Q-M13 issued snapshot composite FK rejects a valid but different package version without trigger masking', async () => {
  await probe(async (tx) => {
    const original = await pending(tx, context);
    const user = await identity(tx);
    await tx`set constraints all immediate`;
    await tx`alter table public.registration_links disable trigger registration_links_insert_guard`;
    const [alternateLinkRow] = await tx`
      insert into public.registration_links(
        workspace_id,package_version_id,token_hash,created_by,created_at,expires_at,
        price_minor,currency,duration_days,duration_months,commission_rate_bp
      )
      select l.workspace_id,l.package_version_id,encode(extensions.gen_random_bytes(32),'hex'),l.created_by,
        statement_timestamp(),statement_timestamp()+interval '24 hours',
        l.price_minor,l.currency,l.duration_days,l.duration_months,l.commission_rate_bp
      from public.registration_links l where l.id=${context.link}
      returning id`;
    await tx`alter table public.registration_links enable trigger registration_links_insert_guard`;
    expect(alternateLinkRow).toBeDefined();
    const alternateLink = alternateLinkRow!.id as string;
    await tx`alter table public.package_versions disable trigger package_versions_insert_guard`;
    const [alternateVersion] = await tx`
      insert into public.package_versions(workspace_id,offer_id,version,name_ar,name_en,price_minor,currency,commission_rate_bp,duration_days,duration_months,published_by)
      select workspace_id,offer_id,version+1,name_ar,name_en,price_minor,currency,commission_rate_bp,duration_days,duration_months,published_by
      from public.package_versions where id=${context.p.versionId}
      returning id`;
    expect(alternateVersion).toBeDefined();
    const clone = {
      ...original,
      id: randomUUID(),
      auth_user_id: user.id,
      registration_link_id: alternateLink,
      package_version_id: alternateVersion!.id,
      email_normalized: `q-m13-${randomUUID()}@example.test`,
      phone_e164: '+2019999999997',
    };
    await tx`alter table public.clients disable trigger signup_client_insert_guard`;
    await tx`alter table public.clients disable trigger signup_client_integrity`;
    await expect(
      tx.savepoint(async (inner) => {
        await inner`insert into public.clients ${inner(clone)}`;
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
it('client derives canonical Auth email; NULL Auth phone preserves claim; non-NULL disagreement rejected', async () => {
  await probe(async (tx) => {
    const c = await pending(tx, context);
    const [u] =
      await tx`select email from auth.users where id=${c.auth_user_id}`;
    expect(c.email_normalized).toBe(u!.email);
    expect(c.approval_state).toBe('pending-approval');
    await tx`update auth.users set phone=null where id=${c.auth_user_id}`;
    const [claim] =
      await tx`select phone_key from app_private.account_identifier_claims where auth_user_id=${c.auth_user_id}`;
    expect(claim!.phone_key).toBe(c.phone_e164);
    await tx`set constraints all immediate`;
    await expect(
      tx.savepoint(async (inner) => {
        await inner`update auth.users set phone='+201000000002' where id=${c.auth_user_id}`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
it('both classification directions reject a staff/client identity', async () => {
  await expect(
    probe(async (tx) => {
      await pending(tx, context, {}, context.po.userId);
    }),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    probe(async (tx) => {
      const c = await pending(tx, context);
      await tx`insert into public.staff_profiles(user_id,role) values(${c.auth_user_id},'trainer')`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
});

it('GoTrue stored digits map to E.164 without defining client phone input acceptance', async () => {
  await probe(async (tx) => {
    const user = await identity(tx, { phone: '201000000099' });
    const c = await pending(
      tx,
      context,
      { phone_e164: '+201000000099' },
      user.id,
    );
    expect(c.phone_e164).toBe('+201000000099');
    await tx`set constraints all immediate`;
  });
});
it('deferred checks reject a client without consumed correspondence', async () => {
  await expect(
    probe(async (tx) => {
      const c = await pending(tx, context);
      // Synthetic mutation isolates the deferred correspondence check, not the F10 marker guard.
      await tx`alter table public.registration_links disable trigger registration_links_update_guard`;
      await tx`update public.registration_links set consumed_at=null where id=${c.registration_link_id}`;
      await tx`set constraints all immediate`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
});
it('backfill collision aborts without merging identities; unresolved phone fails closed', async () => {
  await probe(async (tx) => {
    const u = await identity(tx);
    await expect(
      tx.savepoint(async (inner) => {
        await identity(inner, { email: u.email.toUpperCase() });
      }),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      tx.savepoint(async (inner) => {
        await identity(inner, { phone: 'unresolved' });
      }),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await tx`select 1 from auth.users where id=${u.id}`).toHaveLength(1);
  });
});
it('Q-M03 canonical registry UNIQUE rejects duplicate email keys independently', async () => {
  await probe(async (tx) => {
    const first = await identity(tx);
    const second = await identity(tx);
    expect(first.id).not.toBe(second.id);
    await tx`set constraints all immediate`;
    await tx`alter table app_private.account_identifier_claims disable trigger signup_claim_write_guard`;
    await tx`update app_private.account_identifier_claims set email_key='q-m03-canonical@example.test' where auth_user_id=${first.id}`;
    await expect(
      tx.savepoint(async (inner) => {
        await inner`update app_private.account_identifier_claims set email_key='q-m03-canonical@example.test' where auth_user_id=${second.id}`;
      }),
    ).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'account_identifier_claims_email_key_key',
    });
  });
});
for (const collision of ['email', 'phone', 'both'])
  it(`two real connections contend on normalized ${collision} claims`, async () => {
    const other = sql();
    const email = `race-${randomUUID()}@example.test`;
    const phone = '+201' + Date.now().toString().slice(-10);
    try {
      const results = await Promise.allSettled(
        [db, other].map((connection, i) =>
          connection.begin(async (tx) => {
            await identity(tx, {
              email:
                collision === 'phone'
                  ? `race-${randomUUID()}@example.test`
                  : i
                    ? email.toUpperCase()
                    : email,
              phone: collision === 'email' ? null : phone,
            });
          }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        results
          .filter((r) => r.status === 'rejected')
          .map((r) => r.reason.code),
      ).toEqual(['23505']);
      expect(
        results
          .filter((r) => r.status === 'rejected')
          .map((r) => r.reason.constraint_name),
      ).toEqual([
        `account_identifier_claims_${collision === 'phone' ? 'phone' : 'email'}_key_key`,
      ]);
    } finally {
      await other.end();
    }
  });
it('two real connections serialize staff insert versus client insert on the same Auth identity', async () => {
  const other = sql();
  let user!: Awaited<ReturnType<typeof identity>>;
  await db.begin(async (tx) => {
    user = await identity(tx);
  });
  try {
    const results = await Promise.allSettled([
      db.begin(async (tx) => {
        await pending(tx, context, {}, user.id);
      }),
      other.begin(async (tx) => {
        await tx`insert into public.staff_profiles(user_id,role) values(${user.id},'trainer')`;
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      results.filter((r) => r.status === 'rejected').map((r) => r.reason.code),
    ).toEqual(['23514']);
  } finally {
    await other.end();
  }
});
