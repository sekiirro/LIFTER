import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { admin, loadEnv, sql } from './harness';
import { getStackConfig, selectStack } from '../../scripts/local-stack.mjs';

// T044 only: no application migration, production role or Worker signing code.
// JWTs are pre-issued in this test process; none are saved or reported.
if (selectStack() !== 'b') throw new Error('T044 requires explicit Stack B');
const config = getStackConfig('b');
if (config.projectId !== 'lifter-stack-b')
  throw new Error('T044 target mismatch');
const env = loadEnv();
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('T044 requires local JWT_SECRET in selected env');
const db = sql();
const suffix = randomBytes(6).toString('hex');
const role = `t044_reader_${suffix}`;
const wrongRole = `t044_wrong_${suffix}`;
const schema = `t044_${suffix}`;
const policy = `t044_read_${suffix}`;
const bucket = `t044-${suffix}`;
const object = 'workspace-a/logo.png';
const foreignObject = 'workspace-b/logo.png';
const context = randomBytes(32).toString('hex');
const credentialId = randomUUID();
const subject = randomUUID();
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);
function issue(claimRole = role, lifetime = 300) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      role: claimRole,
      sub: subject,
      aud: 'authenticated',
      iat: now - 1,
      exp: now + lifetime,
      credential_id: credentialId,
    }),
  ).toString('base64url');
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${createHmac('sha256', secret!).update(unsigned).digest('base64url')}`;
}
const jwt = issue();
const wrongJwt = issue(wrongRole);
const expiredJwt = issue(role, -60);
type Observation = {
  role_ok: boolean;
  claims_ok: boolean;
  context_ok: boolean;
  operation: string;
  method: string;
  path_ok: boolean;
  pid: number;
  tx: string;
};
async function request(
  route: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    context?: string | null;
    spoof?: boolean;
    raw?: boolean;
  } = {},
) {
  const id = randomUUID();
  const headers: Record<string, string> = {
    apikey: env.anonKey,
    Authorization: `Bearer ${options.token ?? jwt}`,
    'x-t044-request': id,
  };
  if (options.context !== null)
    headers['x-t044-context'] = options.context ?? context;
  if (options.spoof) {
    headers['storage.operation'] = 'storage.object.get_authenticated';
    headers['x-storage-operation'] = 'storage.object.get_authenticated';
    headers['request.method'] = 'GET';
    headers['request.path'] = `/object/authenticated/${bucket}/${object}`;
    headers['x-t044-role'] = role;
  }
  if (options.body !== undefined)
    headers['Content-Type'] = options.raw ? 'image/png' : 'application/json';
  const response = await fetch(`${env.apiUrl}/storage/v1${route}`, {
    method: options.method ?? 'GET',
    headers,
    redirect: 'manual',
    body:
      options.body === undefined
        ? undefined
        : options.raw
          ? bytes
          : JSON.stringify(options.body),
  });
  // Never return/print upstream bodies, signed URLs, JWTs or request headers.
  const data = Buffer.from(await response.arrayBuffer());
  let signedAllDenied = false;
  try {
    const parsed = JSON.parse(data.toString());
    signedAllDenied =
      Array.isArray(parsed) &&
      parsed.length === 1 &&
      parsed.every(
        (item) => Boolean(item.error) && !item.signedURL && !item.signedUrl,
      );
  } catch {
    /* Object bytes are deliberately not parsed or logged. */
  }
  const rows = await db.unsafe<Observation[]>(
    `select role_ok,claims_ok,context_ok,operation,method,path_ok,pid,tx
    from ${schema}.observations where request_id=$1 order by serial`,
    [id],
  );
  return {
    status: response.status,
    bytesMatch: data.equals(bytes),
    emptyList: data.toString() === '[]',
    signedAllDenied,
    observations: rows,
  };
}
const download = `/object/authenticated/${bucket}/${object}`;
const listed = `/object/list/${bucket}`;
let bucketCreated = false;
let rolesCreated = false;
beforeAll(async () => {
  await db.unsafe(`create role ${role} nologin nosuperuser nobypassrls noinherit;
    create role ${wrongRole} nologin nosuperuser nobypassrls noinherit;`);
  rolesCreated = true;
  await db.unsafe(`grant ${role},${wrongRole} to authenticator;
    create schema ${schema};
    revoke all on schema ${schema} from public;
    create table ${schema}.observations (
      serial bigserial primary key, request_id text, role_ok boolean, claims_ok boolean,
      context_ok boolean, operation text, method text, path_ok boolean, pid integer, tx text);
    grant usage on schema ${schema},storage to ${role},${wrongRole};
    grant select,insert,update,delete on storage.objects to ${role},${wrongRole};
    grant insert on ${schema}.observations to ${role};
    grant usage on sequence ${schema}.observations_serial_seq to ${role};
    create function ${schema}.allowed(b text,n text) returns boolean
    language plpgsql volatile security invoker set search_path='' as $probe$
    declare
      h jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
      c jsonb := coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
      op text := current_setting('storage.operation',true);
      verb text := current_setting('request.method',true);
      correct_role boolean := current_user='${role}' and current_setting('request.jwt.claim.role',true)='${role}';
      correct_claims boolean := c->>'role'='${role}' and c->>'sub'='${subject}' and c->>'credential_id'='${credentialId}';
      correct_context boolean := h->>'x-t044-context'='${context}';
      correct_path boolean := current_setting('request.path',true)='/object/authenticated/${bucket}/${object}';
    begin
      insert into ${schema}.observations(request_id,role_ok,claims_ok,context_ok,operation,method,path_ok,pid,tx)
      values(h->>'x-t044-request',correct_role,correct_claims,coalesce(correct_context,false),op,verb,coalesce(correct_path,false),pg_backend_pid(),pg_current_xact_id()::text);
      return coalesce(correct_role and correct_claims and correct_context and correct_path
        and op='storage.object.get_authenticated' and verb='GET'
        and b='${bucket}' and n='${object}',false);
    end $probe$;
    revoke all on function ${schema}.allowed(text,text) from public;
    grant execute on function ${schema}.allowed(text,text) to ${role};
    create policy ${policy} on storage.objects for select to ${role}
    using (${schema}.allowed(bucket_id,name));`);
  // Service role is confined to private fixture creation and cleanup.
  const client = admin();
  const created = await client.storage.createBucket(bucket, { public: false });
  expect(created.error === null, 'private fixture bucket created').toBe(true);
  bucketCreated = true;
  for (const name of [object, foreignObject]) {
    const uploaded = await client.storage
      .from(bucket)
      .upload(name, bytes, { contentType: 'image/png' });
    expect(uploaded.error === null, 'fixture bytes uploaded').toBe(true);
  }
});
afterAll(async () => {
  try {
    if (bucketCreated) {
      const removed = await admin().storage.emptyBucket(bucket);
      expect(removed.error === null, 'fixture bytes removed').toBe(true);
      const deleted = await admin().storage.deleteBucket(bucket);
      expect(deleted.error === null, 'fixture bucket removed').toBe(true);
    }
  } finally {
    try {
      if (rolesCreated)
        await db.unsafe(`drop policy if exists ${policy} on storage.objects;
        drop schema if exists ${schema} cascade;
        revoke select,insert,update,delete on storage.objects from ${role},${wrongRole};
        revoke usage on schema storage from ${role},${wrongRole};
        revoke ${role},${wrongRole} from authenticator;
        drop role ${role},${wrongRole};`);
    } finally {
      await db.end();
    }
  }
});

it('a/b: restricted JWT authority and transaction-local claims/headers/operation reach object RLS', async () => {
  const roles =
    await db`select rolcanlogin,rolbypassrls,rolsuper,rolcreaterole,rolcreatedb
    from pg_roles where rolname in (${role},${wrongRole})`;
  expect(roles).toHaveLength(2);
  expect(roles.every((r) => Object.values(r).every((v) => v === false))).toBe(
    true,
  );
  const memberships =
    await db`select count(*)::integer as n from pg_auth_members
    where member in (select oid from pg_roles where rolname in (${role},${wrongRole}))`;
  expect(memberships[0]!.n).toBe(0);
  const result = await request(download);
  console.log('T044 authority/context', {
    status: result.status,
    policyEvaluations: result.observations.length,
    allContextChecks: result.observations.every(
      (o) => o.role_ok && o.claims_ok && o.context_ok && o.path_ok,
    ),
    operations: [...new Set(result.observations.map((o) => o.operation))],
  });
  expect(
    result.observations.length > 0,
    'RLS evaluated for the HTTP request',
  ).toBe(true);
  expect(
    result.observations.every(
      (o) =>
        o.role_ok &&
        o.claims_ok &&
        o.context_ok &&
        o.path_ok &&
        o.method === 'GET' &&
        o.operation === 'storage.object.get_authenticated',
    ),
  ).toBe(true);
  expect(result.status).toBe(200);
  expect(result.bytesMatch).toBe(true);
});

it('d: missing/spoofed context, expired JWT, wrong role and foreign path fail closed', async () => {
  for (const options of [
    { context: null },
    { context: 'forged', spoof: true },
    { token: expiredJwt },
    { token: wrongJwt, spoof: true },
    { token: env.anonKey },
  ]) {
    const result = await request(download, options);
    expect(result.status >= 400, 'unauthorized download denied').toBe(true);
    expect(result.bytesMatch).toBe(false);
  }
  const foreign = await request(
    `/object/authenticated/${bucket}/${foreignObject}`,
  );
  expect(foreign.status >= 400, 'unbound workspace object denied').toBe(true);
  expect(foreign.bytesMatch).toBe(false);
  expect(
    (await request(download)).bytesMatch,
    'positive control after denials',
  ).toBe(true);
});

const operations = [
  {
    name: 'list',
    route: listed,
    method: 'POST',
    body: { prefix: '', limit: 100 },
    operation: 'storage.object.list',
  },
  {
    name: 'sign',
    route: `/object/sign/${bucket}/${object}`,
    method: 'POST',
    body: { expiresIn: 60 },
    operation: 'storage.object.sign',
  },
  {
    name: 'sign-many',
    route: `/object/sign/${bucket}`,
    method: 'POST',
    body: { expiresIn: 60, paths: [object] },
    operation: 'storage.object.sign_many',
  },
  {
    name: 'transform',
    route: `/render/image/authenticated/${bucket}/${object}?width=1`,
    operation: 'storage.render.image_authenticated',
  },
  {
    name: 'upload',
    route: `/object/${bucket}/new.png`,
    method: 'POST',
    body: bytes,
    raw: true,
  },
  {
    name: 'update',
    route: `/object/${bucket}/${object}`,
    method: 'PUT',
    body: bytes,
    raw: true,
  },
  { name: 'delete', route: `/object/${bucket}/${object}`, method: 'DELETE' },
  {
    name: 'delete-many',
    route: `/object/${bucket}`,
    method: 'DELETE',
    body: { prefixes: [object] },
  },
  {
    name: 'move',
    route: '/object/move',
    method: 'POST',
    body: { bucketId: bucket, sourceKey: object, destinationKey: 'moved.png' },
  },
  {
    name: 'copy',
    route: '/object/copy',
    method: 'POST',
    body: { bucketId: bucket, sourceKey: object, destinationKey: 'copied.png' },
  },
] as const;
for (const op of operations)
  it(`c/d: ${op.name} cannot borrow download context, even with forged operation headers`, async () => {
    const result = await request(op.route, { ...op, spoof: true });
    console.log('T044 operation', {
      name: op.name,
      status: result.status,
      policyEvaluations: result.observations.length,
      signedAllDenied: result.signedAllDenied,
      operations: [...new Set(result.observations.map((o) => o.operation))],
    });
    // Lists/deletes may intentionally return success with zero visible/affected rows.
    expect(
      result.status >= 400 ||
        result.emptyList ||
        (op.name === 'sign-many' && result.signedAllDenied),
      'operation denied or empty',
    ).toBe(true);
    expect(result.bytesMatch).toBe(false);
    if ('operation' in op) {
      expect(
        result.observations.length > 0,
        'operation actually reached RLS',
      ).toBe(true);
      expect(
        result.observations.every((o) => o.operation === op.operation),
      ).toBe(true);
    }
    const unchanged = await request(download);
    expect(unchanged.status, 'source bytes remain downloadable').toBe(200);
    expect(unchanged.bytesMatch).toBe(true);
  });

it('d: a reused Storage backend clears previous authority/context at transaction boundaries', async () => {
  const prior = new Map<number, string>();
  let reused = false;
  for (let i = 0; i < 32; i++) {
    const allowed = await request(download);
    expect(allowed.bytesMatch).toBe(true);
    for (const o of allowed.observations) prior.set(o.pid, o.tx);
    const denied = await request(download, { context: null });
    expect(denied.status >= 400).toBe(true);
    expect(denied.observations.length > 0).toBe(true);
    for (const o of denied.observations) {
      expect(o.context_ok).toBe(false);
      if (prior.has(o.pid)) {
        expect(
          o.tx === prior.get(o.pid),
          'fresh transaction on reused backend',
        ).toBe(false);
        reused = true;
      }
    }
  }
  expect(
    reused,
    'at least one identical backend PID reused across allow/deny',
  ).toBe(true);
  console.log('T044 pooled reuse', {
    reused,
    observedBackends: prior.size,
    pairs: 32,
  });
});
