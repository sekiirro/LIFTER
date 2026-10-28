import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { signupResult } from '../lib/client-accounts/results.ts';

const payload = Buffer.from(JSON.stringify(signupResult('duplicate', 'en')));
const expectedHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
};
const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (
    path !== '/ordinary-duplicate' &&
    path !== '/archived-collision-synthetic'
  ) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, expectedHeaders).end(payload);
});

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return (sorted[middle - 1] + sorted[middle]) / 2;
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

async function request(port, category) {
  const start = performance.now();
  const response = await fetch(`http://127.0.0.1:${port}/${category}`);
  const body = Buffer.from(await response.arrayBuffer());
  const elapsed = performance.now() - start;
  const headers = {
    'cache-control': response.headers.get('cache-control'),
    'content-type': response.headers.get('content-type'),
    'referrer-policy': response.headers.get('referrer-policy'),
  };
  if (
    response.status !== 200 ||
    !body.equals(payload) ||
    JSON.stringify(headers) !== JSON.stringify(expectedHeaders)
  )
    throw new Error('Duplicate response equality check failed');
  return elapsed;
}

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const { port } = server.address();
try {
  for (let i = 0; i < 20; i += 1) {
    await request(port, 'ordinary-duplicate');
    await request(port, 'archived-collision-synthetic');
  }

  const order = Array.from({ length: 400 }, (_, index) =>
    index % 2 === 0 ? 'ordinary-duplicate' : 'archived-collision-synthetic',
  );
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const samples = {
    'ordinary-duplicate': [],
    'archived-collision-synthetic': [],
  };
  for (const category of order)
    samples[category].push(await request(port, category));

  const ordinary = samples['ordinary-duplicate'];
  const archived = samples['archived-collision-synthetic'];
  const test = mannWhitney(ordinary, archived);
  const medianDifference = Math.abs(median(ordinary) - median(archived));
  if (
    ordinary.length !== 200 ||
    archived.length !== 200 ||
    test.p < 0.01 ||
    medianDifference >= 5
  )
    throw new Error('SC-011 timing regression thresholds failed');

  const format = (values) => values.map((value) => value.toFixed(3)).join(', ');
  const section = [
    '',
    '## U6 SC-011 public duplicate timing differential',
    '',
    "Local loopback HTTP harness calls the production `signupResult('duplicate', 'en')` mapper for both labels. Archived-state design remains deferred on ND-F5-1, so `archived-collision-synthetic` is the approved synthetic stand-in; this measures public result serialization and equality, not database branch latency. Treat the measurement as a regression detector, not a latency SLA.",
    '',
    `- Warm-up: 20 sequential requests per label; measured trials: ${ordinary.length} ordinary and ${archived.length} archived stand-in, randomized and interleaved.`,
    `- Mann-Whitney U: ${test.u.toFixed(3)}; two-sided p-value: ${test.p.toFixed(6)}; absolute median difference: ${medianDifference.toFixed(3)} ms.`,
    `- Thresholds: p >= 0.01 and |median difference| < 5 ms: PASS.`,
    '- Each response matched status 200, identical body bytes, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `Content-Type: application/json; charset=utf-8`.',
    '- No account-existence detail is included in either response.',
    '',
    'Ordinary duplicate timings (ms):',
    '',
    '```text',
    format(ordinary),
    '```',
    '',
    'Archived collision synthetic stand-in timings (ms):',
    '',
    '```text',
    format(archived),
    '```',
    '',
  ].join('\n');
  appendFileSync('tests/integration/client-accounts-verification.md', section);
  console.log(
    `SC-011 passed: ${ordinary.length}+${archived.length} trials, p=${test.p.toFixed(4)}, median delta=${medianDifference.toFixed(3)} ms.`,
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
