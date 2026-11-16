import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertPerformanceMeasurements } from '../../lib/workout-planner/performance-benchmark';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';

const CAP_BYTES = 512 * 1024;
const SAMPLES = 20;
let fixture: ClientNotesFixture;

beforeAll(async () => {
  fixture = await clientNotesFixture();
});
afterAll(async () => fixture?.close());

function plan40() {
  return {
    schema_version: 1,
    days: Array.from({ length: 7 }, (_, day) => ({
      day: day + 1,
      exercises: Array.from({ length: day < 5 ? 6 : 5 }, (_, exercise) => ({
        id: randomUUID(),
        exercise_id: randomUUID(),
        name: `Benchmark exercise ${exercise + 1}`,
        sets: [{ reps: { min: 8, max: 12 }, rest_seconds: 90 }],
      })),
    })),
  };
}

function percentile95(values: number[]) {
  return [...values].sort((a, b) => a - b)[
    Math.ceil(values.length * 0.95) - 1
  ]!;
}

async function documentBytes(content: unknown) {
  const [row] = await fixture.db`
    select pg_catalog.octet_length(${JSON.stringify(content)}::jsonb::text)::int as bytes
  `;
  return Number(row!.bytes);
}

async function largestAcceptedDocument(planId: string) {
  let low = 0;
  let high = CAP_BYTES;
  let version = 1;
  let best = { schema_version: 1, days: [], notes: '' };
  let bestBytes = await documentBytes(best);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = { schema_version: 1, days: [], notes: 'x'.repeat(mid) };
    const saved = await fixture.context.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: version,
      p_content: candidate,
      p_operation_key: randomUUID(),
    });
    if (saved.error) {
      high = mid - 1;
      continue;
    }
    version += 1;
    const [row] = await fixture.db`
      select pg_catalog.octet_length(content::text)::int as bytes
      from public.plan_drafts where plan_id = ${planId}::uuid
    `;
    const actualBytes = Number(row!.bytes);
    if (actualBytes <= CAP_BYTES) {
      low = mid;
      best = candidate;
      bestBytes = actualBytes;
    } else {
      high = mid - 1;
    }
  }
  return { content: best, version, bytes: bestBytes };
}

async function createPlan(content: unknown) {
  const result = await fixture.context.trainerA.client.rpc(
    'create_plan_draft',
    {
      p_workspace_id: fixture.workspaceId,
      p_client_id: fixture.clientId,
      p_plan_kind: 'workout',
      p_content: content,
      p_operation_key: randomUUID(),
    },
  );
  expect(result.error).toBeNull();
  return String(result.data);
}

async function measureSaves(
  planId: string,
  content: unknown,
  initialVersion = 1,
) {
  const latencies: number[] = [];
  let version = initialVersion;
  for (let i = 0; i < SAMPLES; i += 1) {
    const start = performance.now();
    const result = await fixture.context.trainerA.client.rpc(
      'save_plan_draft',
      {
        p_plan_id: planId,
        p_expected_draft_version: version,
        p_content: content,
        p_operation_key: randomUUID(),
      },
    );
    latencies.push(performance.now() - start);
    expect(result.error).toBeNull();
    version += 1;
  }
  return percentile95(latencies);
}

describe('F17 T050 fresh Stack D performance benchmark', () => {
  it('measures a 7-day/40-exercise plan and the largest accepted document', async () => {
    const typical = plan40();
    const typicalBytes = await documentBytes(typical);
    const typicalPlanId = await createPlan(typical);
    const typicalP95Ms = await measureSaves(typicalPlanId, typical);

    const maximumPlanId = await createPlan({ schema_version: 1, days: [] });
    const maximum = await largestAcceptedDocument(maximumPlanId);
    const maximumP95Ms = await measureSaves(
      maximumPlanId,
      maximum.content,
      maximum.version,
    );
    const overCap = { ...maximum.content, notes: `${maximum.content.notes}x` };
    const overCapResult = await fixture.context.trainerA.client.rpc(
      'save_plan_draft',
      {
        p_plan_id: maximumPlanId,
        p_expected_draft_version: maximum.version + SAMPLES,
        p_content: overCap,
        p_operation_key: randomUUID(),
      },
    );

    console.info(
      `T050 benchmark ${JSON.stringify({
        stack: 'D',
        samples: SAMPLES,
        typical: {
          days: 7,
          exercises: 40,
          bytes: typicalBytes,
          p95Ms: typicalP95Ms,
        },
        maximum: { bytes: maximum.bytes, p95Ms: maximumP95Ms },
        capBytes: CAP_BYTES,
        overCapBytes: await documentBytes(overCap),
        overCapRejected: Boolean(overCapResult.error),
      })}`,
    );
    assertPerformanceMeasurements({
      typicalP95Ms,
      maximumP95Ms,
      maximumBytes: maximum.bytes,
      capBytes: CAP_BYTES,
      overCapRejected: Boolean(overCapResult.error),
    });
  });
});
