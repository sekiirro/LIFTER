import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { getActor, createSessionClient, exportPlan, portalPlan, exportWorkout } =
  vi.hoisted(() => ({
    getActor: vi.fn(),
    createSessionClient: vi.fn(),
    exportPlan: vi.fn(),
    portalPlan: vi.fn(),
    exportWorkout: vi.fn(),
  }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('../../lib/auth/actor', () => ({ getActor }));
vi.mock('../../lib/supabase/server', () => ({ createSessionClient }));
vi.mock('../../lib/client-access/portal', async (original) => ({
  ...(await original<typeof import('../../lib/client-access/portal')>()),
  readClientPortalPlan: portalPlan,
}));
vi.mock('../../lib/workout-planner/client-export', async (original) => ({
  ...(await original<
    typeof import('../../lib/workout-planner/client-export')
  >()),
  exportClientWorkoutPlan: exportWorkout,
}));
vi.mock('../../lib/client-access/plan-export', async (original) => ({
  ...(await original<typeof import('../../lib/client-access/plan-export')>()),
  exportClientNutritionPlan: exportPlan,
}));

import { GET } from '../../app/(client)/plans/[planId]/export/route';
import { NextRequest } from 'next/server';

const PLAN = '11111111-1111-4111-8111-aaaaaaaaaaaa';
const call = (query: string, planId = PLAN) =>
  GET(new NextRequest(`https://app.example/plans/${planId}/export${query}`), {
    params: Promise.resolve({ planId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue({ role: null });
  createSessionClient.mockResolvedValue({ rpc: vi.fn() });
  portalPlan.mockResolvedValue({
    status: 'ok',
    plan: { kind: 'nutrition' },
  });
});

describe('F22 client export route (T027, T026 app wall)', () => {
  it('answers 404 for staff or anonymous actors without touching the export', async () => {
    for (const actor of [{ role: 'Trainer' }, { role: 'PO' }, null]) {
      getActor.mockResolvedValue(actor);
      const response = await call('?format=pdf&revision=1');
      expect(response.status).toBe(404);
    }
    expect(exportPlan).not.toHaveBeenCalled();
  });

  it('answers 404 for a malformed plan id, format or revision', async () => {
    expect((await call('?format=pdf', 'nope')).status).toBe(404);
    expect((await call('?format=xlsx')).status).toBe(404);
    expect((await call('')).status).toBe(404);
    expect((await call('?format=pdf&revision=0')).status).toBe(404);
    expect(exportPlan).not.toHaveBeenCalled();
  });

  it('redirects a denial to the plan page with the unavailable marker', async () => {
    exportPlan.mockResolvedValue({ status: 'denied' });
    const response = await call('?format=excel&revision=2');
    expect(response.status).toBe(303);
    const target = new URL(response.headers.get('location')!);
    expect(target.pathname).toBe(`/plans/${PLAN}`);
    expect(target.searchParams.get('export')).toBe('unavailable');
    expect(exportPlan.mock.calls[0]![1]).toMatchObject({
      planId: PLAN,
      revisionNumber: 2,
      format: 'excel',
    });
  });

  it('serves the file with no-store, nosniff and a locked-down CSP', async () => {
    exportPlan.mockResolvedValue({
      status: 'ok',
      format: 'pdf',
      contentType: 'text/html; charset=utf-8',
      filename: 'nutrition-plan-r2.html',
      body: '<p>x</p>',
    });
    const response = await call('?format=pdf&revision=2');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
    expect(await response.text()).toBe('<p>x</p>');
  });
});

describe('F22 client export route, workout branch (T026-T028)', () => {
  beforeEach(() => {
    portalPlan.mockResolvedValue({ status: 'ok', plan: { kind: 'workout' } });
  });

  it('returns the F17 workbook for excel with the nutrition branch headers', async () => {
    exportWorkout.mockResolvedValue({
      status: 'ok',
      format: 'excel',
      revisionNumber: 2,
      contentType: 'application/vnd.test',
      filename: 'workout-plan-r2.xlsx',
      body: new Uint8Array([1, 2, 3]),
    });
    const response = await call('?format=excel&revision=2');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="workout-plan-r2.xlsx"',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(exportWorkout.mock.calls[0]![1]).toMatchObject({
      planId: PLAN,
      revisionNumber: 2,
      format: 'excel',
    });
    expect(exportPlan).not.toHaveBeenCalled();
  });

  it('redirects pdf to the print page, which performs the audited export', async () => {
    const response = await call('?format=pdf&revision=3');
    expect(response.status).toBe(303);
    const target = new URL(response.headers.get('location')!);
    expect(target.pathname).toBe(`/plans/${PLAN}/print`);
    expect(target.searchParams.get('revision')).toBe('3');
    expect(exportWorkout).not.toHaveBeenCalled();
    expect(exportPlan).not.toHaveBeenCalled();
  });

  it('redirects every workout denial, including a failed audit, to the unavailable notice', async () => {
    exportWorkout.mockResolvedValue({ status: 'denied' });
    const response = await call('?format=excel&revision=2');
    expect(response.status).toBe(303);
    expect(
      new URL(response.headers.get('location')!).searchParams.get('export'),
    ).toBe('unavailable');
  });

  it('audits a restricted denial under the workout export too, and releases nothing', async () => {
    portalPlan.mockResolvedValue({ status: 'restricted' });
    exportPlan.mockResolvedValue({ status: 'denied' });
    exportWorkout.mockResolvedValue({ status: 'denied' });
    const response = await call('?format=pdf&revision=2');
    expect(response.status).toBe(303);
    expect(exportWorkout).toHaveBeenCalledTimes(1);
    expect(exportPlan).toHaveBeenCalledTimes(1);
    exportWorkout.mockClear();
    portalPlan.mockResolvedValue({ status: 'not_found' });
    await call('?format=pdf&revision=2');
    expect(exportWorkout).not.toHaveBeenCalled();
  });

  it('never exports a plan the client wall did not return (restricted, foreign, unknown)', async () => {
    exportWorkout.mockClear();
    for (const status of ['not_found', 'denied']) {
      portalPlan.mockResolvedValue({ status });
      exportPlan.mockResolvedValue({ status: 'denied' });
      const response = await call('?format=excel&revision=2');
      expect(response.status, status).toBe(303);
    }
    expect(exportWorkout).not.toHaveBeenCalled();
  });
});
