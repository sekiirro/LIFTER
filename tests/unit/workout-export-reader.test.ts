import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  return {
    create: vi.fn(),
    actor: vi.fn(),
    from: vi.fn(),
    rpc: vi.fn(),
    getUser: vi.fn(),
    query,
    filters: [] as unknown[][],
    rows: [] as Array<Record<string, unknown>>,
  };
});

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({ createSessionClient: m.create }));
vi.mock('../../lib/auth/actor', () => ({ loadActorRows: m.actor }));

import {
  loadAuthorizedWorkoutExportPayload,
  parseWorkoutExportRequest,
} from '../../lib/workout-planner/export-reader';

const uuid = (tail: string) =>
  `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;

const WS = uuid('900');
const OTHER_WS = uuid('950');
const REVISION_ID = uuid('901');
const PLAN_ID = uuid('903');
const EX_ID = uuid('1');

const EMPTY_DOCUMENT = {
  schema_version: 1,
  notes: 'Reader unit note',
  days: [],
};

const DOCUMENT_WITH_REF = {
  schema_version: 1,
  notes: 'Reader unit note',
  days: [
    {
      id: uuid('11'),
      kind: 'session',
      title: 'Day 1',
      items: [
        {
          id: uuid('21'),
          exercise: { source: 'global', identity_id: EX_ID, version: 1 },
          name: 'Bench Press',
          alternatives: [],
          sets: [
            {
              id: uuid('31'),
              type: 'working',
              load: { mode: 'bodyweight' },
            },
          ],
        },
      ],
    },
  ],
};

function revisionRow(
  content: unknown,
  workspaceId: string = WS,
): Record<string, unknown> {
  return {
    id: REVISION_ID,
    workspace_id: workspaceId,
    plan_id: PLAN_ID,
    revision_number: 4,
    plan_kind: 'workout',
    content,
  };
}

function auditArgs() {
  return m.rpc.mock.calls.find(
    ([name]) => name === 'record_workout_export_audit',
  )?.[1] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.filters = [];
  m.rows = [revisionRow(EMPTY_DOCUMENT)];
  m.query.select.mockReturnValue(m.query);
  m.query.eq.mockImplementation((key: string, value: unknown) => {
    m.filters.push([key, value]);
    return m.query;
  });
  m.query.maybeSingle.mockImplementation(async () => {
    const id = m.filters.find(([key]) => key === 'id')?.[1];
    const kind = m.filters.find(([key]) => key === 'plan_kind')?.[1];
    const row =
      m.rows.find(
        (candidate) => candidate.id === id && candidate.plan_kind === kind,
      ) ?? null;
    return { data: row, error: null };
  });
  m.from.mockImplementation(() => {
    m.filters = [];
    return m.query;
  });
  m.create.mockResolvedValue({
    auth: { getUser: m.getUser },
    from: m.from,
    rpc: m.rpc,
  });
  m.getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
  m.actor.mockResolvedValue({
    userId: 'u',
    role: 'trainer',
    activeWorkspaceIds: [WS],
  });
  m.rpc.mockImplementation(async (name: string) => {
    if (name === 'record_workout_export_audit') {
      return { data: null, error: null };
    }
    return { data: null, error: { message: 'unexpected rpc' } };
  });
});

const load = (overrides: Record<string, unknown> = {}) =>
  loadAuthorizedWorkoutExportPayload({
    revisionId: REVISION_ID,
    locale: 'en',
    format: 'pdf',
    ...overrides,
  });

describe('shared workout export reader (S60-D2)', () => {
  describe('parseWorkoutExportRequest', () => {
    const request = (query: string) =>
      new Request(`http://local/api/workouts/print?${query}`);

    it('parses a valid revision + locale', () => {
      expect(
        parseWorkoutExportRequest(request(`revision=${REVISION_ID}&locale=ar`)),
      ).toEqual({ revisionId: REVISION_ID, locale: 'ar' });
    });

    it.each([
      ['missing revision', `locale=en`],
      ['non-UUID revision', `revision=not-a-uuid&locale=en`],
      ['missing locale', `revision=${REVISION_ID}`],
      ['unsupported locale', `revision=${REVISION_ID}&locale=fr`],
    ])('returns null for %s', (_name, query) => {
      expect(parseWorkoutExportRequest(request(query))).toBeNull();
    });
  });

  describe('denied and not-found paths', () => {
    it('denies an invalid revision id without touching the database', async () => {
      const result = await load({ revisionId: 'not-a-uuid' });
      expect(result).toEqual({ ok: false, status: 404 });
      expect(m.from).not.toHaveBeenCalled();
      expect(m.rpc).not.toHaveBeenCalled();
    });

    it('denies an invalid locale without touching the database', async () => {
      const result = await load({ locale: 'fr' as 'en' });
      expect(result).toEqual({ ok: false, status: 404 });
      expect(m.from).not.toHaveBeenCalled();
      expect(m.rpc).not.toHaveBeenCalled();
    });

    it('denies when there is no session client', async () => {
      m.create.mockResolvedValue(null);
      const result = await load();
      expect(result).toEqual({ ok: false, status: 404 });
      expect(m.from).not.toHaveBeenCalled();
    });

    it('denies an unauthenticated user as not_permitted', async () => {
      m.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'no session' },
      });
      const result = await load();
      expect(result).toEqual({ ok: false, status: 404 });
      expect(m.from).not.toHaveBeenCalled();
      expect(auditArgs()).toMatchObject({
        p_outcome: 'denied',
        p_reason: 'not_permitted',
      });
    });

    it('denies when the actor cannot be loaded', async () => {
      m.actor.mockResolvedValue(null);
      const result = await load();
      expect(result).toEqual({ ok: false, status: 404 });
      expect(m.from).not.toHaveBeenCalled();
    });

    it('denies Sales before loading any revision', async () => {
      m.actor.mockResolvedValue({
        userId: 'u',
        role: 'sales',
        activeWorkspaceIds: [WS],
      });
      const result = await load();
      expect(result).toEqual({ ok: false, status: 404 });
      expect(m.from).not.toHaveBeenCalled();
      expect(auditArgs()).toMatchObject({
        p_outcome: 'denied',
        p_reason: 'not_permitted',
      });
    });

    it('denies a missing revision as not_found', async () => {
      m.rows = [];
      const result = await load();
      expect(result).toEqual({ ok: false, status: 404 });
      expect(auditArgs()).toMatchObject({
        p_outcome: 'denied',
        p_reason: 'not_found',
      });
    });

    it('denies a revision in a foreign workspace', async () => {
      m.rows = [revisionRow(EMPTY_DOCUMENT, OTHER_WS)];
      const result = await load();
      expect(result).toEqual({ ok: false, status: 404 });
      expect(auditArgs()).toMatchObject({
        p_outcome: 'denied',
        p_reason: 'not_permitted',
      });
    });

    it('denies when a referenced exercise cannot be resolved', async () => {
      m.rows = [revisionRow(DOCUMENT_WITH_REF)];
      m.rpc.mockImplementation(async (name: string) => {
        if (name === 'record_workout_export_audit') {
          return { data: null, error: null };
        }
        return { data: [], error: null };
      });
      const result = await load();
      expect(result).toEqual({ ok: false, status: 404 });
      expect(auditArgs()).toMatchObject({
        p_outcome: 'denied',
        p_reason: 'not_found',
      });
    });

    it('loads the authorized payload on the success path', async () => {
      const result = await load();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.payload.planIdentity).toBe('4');
      expect(result.payload.documentNotes).toBe('Reader unit note');
      expect(result.revision.id).toBe(REVISION_ID);
      expect(auditArgs()).toMatchObject({
        p_outcome: 'success',
        p_format: 'pdf',
      });
    });
  });
});
