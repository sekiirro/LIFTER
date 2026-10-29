import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function twoSidedNormalP(z) {
  const absolute = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * absolute);
  const density = 0.3989422804014327 * Math.exp(-(absolute * absolute) / 2);
  const tail =
    density *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return Math.min(1, 2 * tail);
}

function mannWhitney(first, second) {
  const combined = [
    ...first.map((value) => ({ value, group: 0 })),
    ...second.map((value) => ({ value, group: 1 })),
  ].sort((a, b) => a.value - b.value);
  let rankSumFirst = 0;
  let tieTerm = 0;
  for (let start = 0; start < combined.length;) {
    let end = start + 1;
    while (
      end < combined.length &&
      combined[end].value === combined[start].value
    )
      end += 1;
    const count = end - start;
    const averageRank = (start + 1 + end) / 2;
    for (let i = start; i < end; i += 1)
      if (combined[i].group === 0) rankSumFirst += averageRank;
    tieTerm += count ** 3 - count;
    start = end;
  }
  const n1 = first.length;
  const n2 = second.length;
  const u = rankSumFirst - (n1 * (n1 + 1)) / 2;
  const total = n1 + n2;
  const tieCorrection = 1 - tieTerm / (total ** 3 - total);
  const variance = ((n1 * n2 * (total + 1)) / 12) * tieCorrection;
  if (variance <= 0) return { u, p: Math.abs(u - (n1 * n2) / 2) < 0.5 ? 1 : 0 };
  const centered = u - (n1 * n2) / 2;
  const corrected = Math.max(0, Math.abs(centered) - 0.5);
  return { u, p: twoSidedNormalP(corrected / Math.sqrt(variance)) };
}

// Vitest resolves TS imports and removes only the server-only import guard.
// Production clients, fetch, admission/HMAC, validation and RPCs remain real.
export async function runTiming() {
  const { processClientSignup } =
    await import('../lib/client-accounts/service.ts');
  const { signupResult } = await import('../lib/client-accounts/results.ts');
  const { registrationFixture, backdated } =
    await import('../tests/integration/registration-links-fixture.ts');
  const { sql } = await import('../tests/integration/harness.ts');
  assert.equal(
    process.env.API_URL || process.env.SUPABASE_URL,
    'http://127.0.0.1:54321',
  );
  const target = new URL(process.env.DB_URL || process.env.SUPABASE_DB_URL);
  assert.equal(target.hostname, '127.0.0.1');
  assert.equal(target.port, '54322');
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_ANON_KEY =
    process.env.ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const f = await registrationFixture(),
    db = sql();
  const run = randomUUID(),
    categories = ['ordinary-duplicate', 'archived-collision-synthetic'];
  const origin = 'http://localhost:3000';
  const usedTokens = new Set(),
    usedSecrets = new Set(),
    usedIps = new Set();
  const prefix = randomBytes(2).toString('hex');
  let sequence = 0;
  async function freshInputs(email) {
    const link = await backdated(
      f,
      new Date(Date.now() + 86_400_000).toISOString(),
    );
    const requestSecret = randomBytes(32).toString('base64url');
    // Every IPv6 /64 must differ: admission groups addresses by subnet.
    const ip = `2001:db8:${prefix}:${(++sequence).toString(16)}::1`;
    for (const [set, value] of [
      [usedTokens, link.token],
      [usedSecrets, requestSecret],
      [usedIps, ip],
    ]) {
      assert(!set.has(value), 'admission fixture must never repeat');
      set.add(value);
    }
    return {
      token: link.token,
      requestSecret,
      fields: {
        name: 'SC011 synthetic',
        email,
        phone: JSON.stringify({ country: 'EG', nationalNumber: '01012345678' }),
        password: 'Synthetic9!Password',
      },
      origin,
      expectedOrigin: origin,
      headers: new Headers({ origin, 'CF-Connecting-IP': ip }),
      signedIn: async () => false,
      locale: 'en',
    };
  }
  const accountCounts = async () =>
    (
      await db`select (select count(*)::int from auth.users) as auth_users, (select count(*)::int from public.clients) as clients, (select count(*)::int from auth.identities) as identities`
    )[0];
  const timings = [],
    warmup = [];
  let before, after, expectedWire, failure, failedTrial;
  const expectedPublicBytes = JSON.stringify(signupResult('duplicate', 'en'));
  try {
    const emails = categories.map(() => `sc011-${randomUUID()}@example.test`);
    // Both fixtures start as ordinary accounts via real admission/signup.
    for (let i = 0; i < emails.length; i++) {
      const input = await freshInputs(emails[i]);
      input.fields.phone = JSON.stringify({
        country: 'EG',
        nationalNumber: i === 0 ? '01012345671' : '01012345672',
      });
      assert.equal((await processClientSignup(input)).status, 'complete');
    }
    // ND-F5-1 marker only; no production archived-state behavior added.
    await db`update auth.users set deleted_at=clock_timestamp() where email=${emails[1]}`;
    const markers =
      await db`select deleted_at is not null as archived from auth.users where email in (${emails[0]},${emails[1]})`;
    assert.deepEqual(markers.map((r) => r.archived).sort(), [false, true]);
    before = await accountCounts();
    async function trial(category, measured) {
      const input = await freshInputs(emails[categories.indexOf(category)]);
      const calls = [],
        responses = [],
        realFetch = globalThis.fetch;
      globalThis.fetch = async (...args) => {
        const response = await realFetch(...args);
        const url = new URL(
          args[0] instanceof Request ? args[0].url : String(args[0]),
        );
        if (url.pathname.startsWith('/rest/v1/rpc/')) {
          calls.push(url.pathname.split('/').at(-1));
          if (url.pathname.endsWith('/client_signup')) {
            const volatile = [
              'date',
              'connection',
              'keep-alive',
              'transfer-encoding',
              'x-kong-proxy-latency',
              'x-kong-upstream-latency',
              'x-request-id',
            ];
            responses.push({
              status: response.status,
              headers: [...response.headers].filter(
                ([name]) => !volatile.includes(name),
              ),
              bytes: Buffer.from(await response.clone().arrayBuffer()).toString(
                'hex',
              ),
            });
          }
        }
        return response;
      };
      let result, elapsed;
      try {
        const start = performance.now();
        result = await processClientSignup(input);
        elapsed = performance.now() - start;
      } finally {
        globalThis.fetch = realFetch;
      }
      (measured ? timings : warmup).push({ category, ms: elapsed });
      try {
        assert.deepEqual(calls, ['client_signup_admit', 'client_signup']);
        assert.equal(responses.length, 1);
        const wire = responses[0];
        assert.equal(wire.status, 200);
        assert.deepEqual(
          JSON.parse(Buffer.from(wire.bytes, 'hex').toString()),
          { status: 'duplicate' },
        );
        expectedWire ??= wire;
        assert.deepEqual(wire, expectedWire);
        const publicBytes = JSON.stringify(result);
        assert.equal(publicBytes, expectedPublicBytes);
      } catch {
        failedTrial = { category, calls, responses, publicResult: result };
        throw new Error('SC-011 path or response equality failed');
      }
    }
    for (let i = 0; i < 20; i++)
      for (const category of categories) await trial(category, false);
    // Randomized pairs balance temporal drift while interleaving 200 per label.
    for (const block of Array.from({ length: 200 }, () => randomInt(2)))
      for (const category of block ? [...categories].reverse() : categories)
        await trial(category, true);
  } catch {
    failure = 'Path, fixture or response equality check failed';
  } finally {
    after = await accountCounts();
    try {
      assert.deepEqual(after, before);
    } catch {
      failure ??= 'Account count changed during collision trials';
    }
    const ordinary = timings
      .filter((r) => r.category === categories[0])
      .map((r) => r.ms);
    const archived = timings
      .filter((r) => r.category === categories[1])
      .map((r) => r.ms);
    const test =
      ordinary.length && archived.length
        ? mannWhitney(ordinary, archived)
        : { u: null, p: null };
    const medians = [median(ordinary), median(archived)],
      medianDifference = Math.abs(medians[0] - medians[1]);
    const pass =
      !failure &&
      ordinary.length === 200 &&
      archived.length === 200 &&
      test.p >= 0.01 &&
      medianDifference < 5;
    const report = {
      run,
      verdict: pass ? 'PASS' : 'FAIL',
      failure,
      failedTrial,
      environment: {
        node: process.version,
        platform: process.platform,
        api: '127.0.0.1:54321',
        db: '127.0.0.1:54322',
      },
      before,
      after,
      n: [ordinary.length, archived.length],
      ...test,
      medians,
      medianDifference,
      expectedPublicBytes,
      signupRpc: expectedWire,
      warmup,
      timings,
    };
    appendFileSync(
      'tests/integration/client-accounts-verification.md',
      [
        '',
        '## SC-011 real-path timing differential (supersedes the earlier fixed-response serialization runs)',
        '',
        'Earlier SC-011 runs measured only response serialization and are superseded. Regression detector, not a guarantee.',
        '',
        'Command: `node --env-file=.env.local scripts/verify-client-signup-timing.mjs`.',
        'Layer: production processClientSignup in-process, real anonymous Supabase HTTP clients, real client_signup_admit then client_signup for every request. Next exposes a Server Action rather than a standalone JSON endpoint; the stable service entry point avoids framework action IDs/React transport. Only the server-only import guard is mocked by Vitest. Anonymous session and same-origin Headers are supplied explicitly.',
        'Fixture: shared registrationFixture/backdated helpers; two real admitted client accounts, second marked auth.users.deleted_at only in test setup, retaining canonical identity claims (ND-F5-1). Both conditions collide on email; a separate valid submitted phone avoids cross-condition phone collision. Every setup/warm-up/trial receives a new link, random request secret and unique IPv6 /64 through CF-Connecting-IP, asserted unique. Provisioning is outside timing.',
        '20 warm-up requests per condition, then 200 randomized interleaved pairs (200 per condition). Timing includes validation/HMAC, both HTTP RPCs and result mapping. Equality asserts public D-08 JSON bytes and real signup RPC bytes/status/all stable end-to-end headers, excluding hop-by-hop Connection/Keep-Alive/Transfer-Encoding and Date, X-Kong-Proxy-Latency, X-Kong-Upstream-Latency and X-Request-Id (volatile gateway metadata). Outer Next Server Action transport headers are not measured. Mann-Whitney: tie correction, continuity-corrected two-sided normal approximation; thresholds p >= 0.01 and absolute median delta < 5 ms.',
        'Account counts bracket all warm-up/measured collisions after creating the two fixtures. Cleanup: script resets Stack A and runs provisioning after worker exit, including on failure.',
        '',
        '```text',
        JSON.stringify(report, null, 2),
        '```',
        '',
      ].join('\n'),
    );
    console.log(
      JSON.stringify({
        ...report,
        warmup: undefined,
        timings: undefined,
        signupRpc: undefined,
        expectedPublicBytes: undefined,
      }),
    );
    await db.end();
    if (!pass)
      throw new Error(
        'SC-011 FAILED; raw evidence recorded. Stop without committing.',
      );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      'vitest.integration.config.ts',
      'tests/integration/client-accounts-timing.test.ts',
    ],
    { stdio: 'inherit', env: { ...process.env, SC011_TIMING_RUN: 'true' } },
  );
  // Shared fixtures persist by design; clean only the configured local A stack.
  const reset = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--yes', 'supabase@2.122.0', 'db', 'reset', '--local'],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  const provision =
    reset.status === 0
      ? spawnSync(
          process.execPath,
          ['tests/integration/client-accounts-provision.mjs'],
          { stdio: 'inherit' },
        )
      : null;
  process.exitCode =
    result.status === 0 && reset.status === 0 && provision?.status === 0
      ? 0
      : 1;
}
