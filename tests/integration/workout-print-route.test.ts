import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';

const mocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  actor: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));
vi.mock('../../lib/auth/actor', () => ({
  loadActorRows: mocks.actor,
}));

import { GET } from '../../app/api/workouts/print/route';
import { getMessages } from '../../lib/i18n';

let fixture: ClientNotesFixture;
const db = () => fixture.db;

let publishedRevisionId: string;
let draftPlanId: string;

beforeAll(async () => {
  fixture = await clientNotesFixture();

  // 1. Create a published plan revision
  const pubDraft = await fixture.context.trainerA.client.rpc(
    'create_plan_draft',
    {
      p_workspace_id: fixture.workspaceId,
      p_client_id: fixture.clientId,
      p_plan_kind: 'workout',
      p_content: {
        schema_version: 1,
        notes: 'Published plan note for print',
        days: [
          {
            id: randomUUID(),
            kind: 'session',
            title: 'Leg Day',
            notes: 'Session notes',
            items: [],
          },
          {
            id: randomUUID(),
            kind: 'rest',
            title: 'Recovery',
            notes: 'Rest notes',
            items: [],
          },
        ],
      },
      p_operation_key: randomUUID(),
    },
  );
  expect(pubDraft.error).toBeNull();
  const pubPlanId = String(pubDraft.data);

  const [root] = await db()`
    select created_by from public.plan_roots
    where workspace_id = ${fixture.workspaceId} and id = ${pubPlanId}
  `;
  publishedRevisionId = randomUUID();
  await db()`
    insert into public.plan_revisions (
      id, workspace_id, plan_id, revision_number, source_draft_version,
      plan_kind, content, authored_by
    )
    select ${publishedRevisionId}, d.workspace_id, d.plan_id, 1, d.draft_version,
           'workout', d.content, ${root!.created_by}
    from public.plan_drafts d
    where d.workspace_id = ${fixture.workspaceId} and d.plan_id = ${pubPlanId}
  `;

  // 2. Create an unpublished draft plan
  const draftOnly = await fixture.context.trainerA.client.rpc(
    'create_plan_draft',
    {
      p_workspace_id: fixture.workspaceId,
      p_client_id: fixture.clientId,
      p_plan_kind: 'workout',
      p_content: {
        schema_version: 1,
        notes: 'Unpublished draft note',
        days: [],
      },
      p_operation_key: randomUUID(),
    },
  );
  expect(draftOnly.error).toBeNull();
  draftPlanId = String(draftOnly.data);
});

afterAll(async () => {
  await fixture?.close();
});

describe('F17 PDF print route integration (T037)', () => {
  it('returns the authorized published payload for EN and AR locales', async () => {
    mocks.createSessionClient.mockResolvedValue(
      fixture.context.trainerA.client,
    );
    mocks.actor.mockResolvedValue({
      userId: fixture.context.trainerA.userId,
      role: 'trainer',
      activeWorkspaceIds: [fixture.workspaceId],
    });

    const resEn = await GET(
      new Request(
        `http://localhost/api/workouts/print?revision=${publishedRevisionId}&locale=en`,
      ),
    );
    expect(resEn.status).toBe(200);
    expect(resEn.headers.get('cache-control')).toBe('no-store');
    expect(resEn.headers.get('vary')).toBe('Cookie');
    const bodyEn = await resEn.json();
    expect(bodyEn.status).toBe('ok');
    expect(bodyEn.payload.planTitle).toBe(
      getMessages('en')['workout.export.plan'],
    );
    expect(bodyEn.payload.planIdentity).toBe('1');
    expect(bodyEn.payload.documentNotes).toBe('Published plan note for print');
    expect(bodyEn.payload.days).toHaveLength(2);

    const resAr = await GET(
      new Request(
        `http://localhost/api/workouts/print?revision=${publishedRevisionId}&locale=ar`,
      ),
    );
    expect(resAr.status).toBe(200);
    const bodyAr = await resAr.json();
    expect(bodyAr.status).toBe('ok');
    expect(bodyAr.payload.planTitle).toBe(
      getMessages('ar')['workout.export.plan'],
    );
    expect(bodyAr.payload.documentNotes).toBe('Published plan note for print');
  });

  it('denies foreign workspace actor with generic 404', async () => {
    // Trainer B in Workspace B attempting to read Workspace A revision
    mocks.createSessionClient.mockResolvedValue(
      fixture.context.trainerB.client,
    );
    mocks.actor.mockResolvedValue({
      userId: fixture.context.trainerB.userId,
      role: 'trainer',
      activeWorkspaceIds: [fixture.context.wsB.id],
    });

    const req = new Request(
      `http://localhost/api/workouts/print?revision=${publishedRevisionId}&locale=en`,
    );
    const res = await GET(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ status: 'unavailable' });
  });

  it('denies Sales role with generic 404 before reading revision content', async () => {
    // Sales A in same workspace lacks coaching_work capability
    mocks.createSessionClient.mockResolvedValue(fixture.context.salesA.client);
    mocks.actor.mockResolvedValue({
      userId: fixture.context.salesA.userId,
      role: 'sales',
      activeWorkspaceIds: [fixture.workspaceId],
    });

    const req = new Request(
      `http://localhost/api/workouts/print?revision=${publishedRevisionId}&locale=en`,
    );
    const res = await GET(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ status: 'unavailable' });
  });

  it('denies unpublished draft with generic 404 (published-only enforcement)', async () => {
    // Prove the draft genuinely exists (plan_drafts row, no revision row), so
    // this denial tests published-only enforcement rather than a missing id.
    const [draft] = await db()`
      select plan_id from public.plan_drafts
      where workspace_id = ${fixture.workspaceId} and plan_id = ${draftPlanId}
    `;
    expect(draft?.plan_id).toBe(draftPlanId);
    const [leaked] = await db()`
      select id from public.plan_revisions
      where workspace_id = ${fixture.workspaceId} and id = ${draftPlanId}
    `;
    expect(leaked).toBeUndefined();

    mocks.createSessionClient.mockResolvedValue(
      fixture.context.trainerA.client,
    );
    mocks.actor.mockResolvedValue({
      userId: fixture.context.trainerA.userId,
      role: 'trainer',
      activeWorkspaceIds: [fixture.workspaceId],
    });

    // Passing draftPlanId (which exists in plan_drafts, but not in plan_revisions)
    const req = new Request(
      `http://localhost/api/workouts/print?revision=${draftPlanId}&locale=en`,
    );
    const res = await GET(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ status: 'unavailable' });
  });
});
