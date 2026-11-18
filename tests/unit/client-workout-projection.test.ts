import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  buildClientWorkoutPayload,
  loadClientWorkoutPlan,
  projectClientWorkoutPlan,
} from '../../lib/workout-planner/client-projection';
import {
  ALT_ID,
  BENCH_URL,
  PLAN_ID,
  PRIVATE_URL,
  rawDocument,
  rawExercises,
  rawOk,
  uuid,
} from './client-workout-fixture';

// F16/F17 client-safe workout projection (F22 T017/T028; FR-004, FR-006,
// FR-010; F16 FR-029): the app-layer wall over `client_portal_workout_plan`.
const request = { planId: PLAN_ID, revisionNumber: 2 };

describe('projectClientWorkoutPlan', () => {
  it('projects the closed ok shape into the shared F17 payload with live names and videos', () => {
    const result = projectClientWorkoutPlan(rawOk(), request);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.projection.plan.revisionNumber).toBe(2);
    const payload = buildClientWorkoutPayload(result.projection, 'en');
    expect(payload.planIdentity).toBe('2');
    const item = payload.days[0]!.items[0]!;
    expect(item.name).toBe('Bench Press');
    expect(item.videoUrl).toBe(BENCH_URL);
    expect(item.alternatives).toEqual([
      { name: 'Dumbbell Press' },
      { name: 'Coach Private Press', videoUrl: PRIVATE_URL },
    ]);
    expect(payload.days[1]!.kind).toBe('rest');
  });

  it('returns not_found and restricted without plan content', () => {
    expect(projectClientWorkoutPlan({ status: 'not_found' }, request)).toEqual({
      status: 'not_found',
    });
    const restricted = projectClientWorkoutPlan(
      {
        status: 'restricted',
        subscription: {
          status: 'expired',
          effective_end_exclusive: '2026-01-01',
        },
      },
      request,
    );
    expect(restricted).toEqual({
      status: 'restricted',
      subscription: { status: 'expired', effectiveEndExclusive: '2026-01-01' },
    });
  });

  it('never releases content when the subscription is not active, even if the DB said ok', () => {
    const result = projectClientWorkoutPlan(
      rawOk({
        subscription: { status: 'frozen', effective_end_exclusive: null },
      }),
      request,
    );
    expect(result.status).toBe('restricted');
    expect(JSON.stringify(result)).not.toContain('Bench Press');
  });

  it('denies a different plan id or revision than requested', () => {
    expect(
      projectClientWorkoutPlan(rawOk(), { ...request, planId: uuid('ff') }),
    ).toEqual({ status: 'denied' });
    expect(
      projectClientWorkoutPlan(rawOk(), { ...request, revisionNumber: 1 }),
    ).toEqual({ status: 'denied' });
    expect(
      projectClientWorkoutPlan(rawOk(), { ...request, revisionNumber: null })
        .status,
    ).toBe('ok');
  });

  it('denies any staff-only or private catalog field on an exercise entry', () => {
    for (const extra of [
      { description: 'library description' },
      { notes: 'trainer private notes' },
      { created_by: uuid('99') },
      { origin_workspace_id: uuid('98') },
      { payload: { defaults: {} } },
      { name_ar: 'x' },
      { effective_fields: {} },
    ]) {
      const exercises = rawExercises();
      Object.assign(exercises[0]!, extra);
      expect(
        projectClientWorkoutPlan(rawOk({ exercises }), request),
        JSON.stringify(extra),
      ).toEqual({ status: 'denied' });
    }
  });

  it('denies unknown top-level, plan or subscription keys', () => {
    expect(
      projectClientWorkoutPlan(rawOk({ authored_by: uuid('97') }), request),
    ).toEqual({ status: 'denied' });
    const plan = { ...rawOk().plan, authored_by: uuid('97') };
    expect(projectClientWorkoutPlan(rawOk({ plan }), request)).toEqual({
      status: 'denied',
    });
    expect(
      projectClientWorkoutPlan(
        rawOk({
          subscription: {
            status: 'active',
            effective_end_exclusive: null,
            subscription_id: uuid('96'),
          },
        }),
        request,
      ),
    ).toEqual({ status: 'denied' });
  });

  it('denies the whole call when any referenced exercise is not resolved', () => {
    const exercises = rawExercises().filter((e) => e.identity_id !== ALT_ID);
    expect(projectClientWorkoutPlan(rawOk({ exercises }), request)).toEqual({
      status: 'denied',
    });
  });

  it('denies an invalid document, unknown document keys and malformed rows', () => {
    const document = rawDocument() as Record<string, unknown>;
    document.internal_note = 'staff only';
    expect(projectClientWorkoutPlan(rawOk({ document }), request)).toEqual({
      status: 'denied',
    });
    expect(projectClientWorkoutPlan(rawOk({ document: 'x' }), request)).toEqual(
      { status: 'denied' },
    );
    expect(projectClientWorkoutPlan(null, request)).toEqual({
      status: 'denied',
    });
    expect(projectClientWorkoutPlan({ status: 'invalid' }, request)).toEqual({
      status: 'denied',
    });
    expect(
      projectClientWorkoutPlan(rawOk({ exercises: [{ name: '' }] }), request),
    ).toEqual({ status: 'denied' });
  });
});

describe('loadClientWorkoutPlan', () => {
  it('sends only the plan id and revision selector and no client or workspace id', async () => {
    const rpc = vi.fn(async () => ({ data: rawOk(), error: null }));
    const result = await loadClientWorkoutPlan({ rpc }, PLAN_ID, 2);
    expect(result.status).toBe('ok');
    expect(rpc).toHaveBeenCalledWith('client_portal_workout_plan', {
      p_plan_id: PLAN_ID,
      p_revision_number: 2,
    });
  });

  it('is not_found for non-uuid plan ids and invalid revisions without calling the database', async () => {
    const rpc = vi.fn();
    for (const planId of ['', 'abc', "x'; drop table"])
      expect(await loadClientWorkoutPlan({ rpc }, planId, null)).toEqual({
        status: 'not_found',
      });
    for (const revision of [0, -1, 1.5, Number.NaN])
      expect(await loadClientWorkoutPlan({ rpc }, PLAN_ID, revision)).toEqual({
        status: 'not_found',
      });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('denies on an RPC error or a thrown error', async () => {
    expect(
      await loadClientWorkoutPlan(
        { rpc: async () => ({ data: null, error: { code: '42501' } }) },
        PLAN_ID,
        null,
      ),
    ).toEqual({ status: 'denied' });
    expect(
      await loadClientWorkoutPlan(
        {
          rpc: async () => {
            throw new Error('network');
          },
        },
        PLAN_ID,
        null,
      ),
    ).toEqual({ status: 'denied' });
  });
});
