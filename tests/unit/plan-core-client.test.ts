import { describe, expect, it, vi } from 'vitest';
import {
  createPlanCoreClient,
  PlanCoreClientError,
  type PlanCoreTransport,
} from '../../lib/plan-core/client';

const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const REVISION_ID = '33333333-3333-4333-8333-333333333333';
const OPERATION_KEY = '44444444-4444-4444-8444-444444444444';

const content = {
  kind: 'workout',
  schemaVersion: 1,
  document: {
    exercises: [
      {
        kind: 'exercise',
        identityId: '55555555-5555-4555-8555-555555555555',
        version: 3,
        snapshot: {
          exerciseId: '55555555-5555-4555-8555-555555555555',
          version: 3,
          names: { ar: 'ضغط صدر', en: 'Bench press' },
          primaryMuscle: 'chest',
          secondaryMuscles: [],
          equipment: 'barbell',
        },
      },
    ],
  },
};

const revision = {
  planId: PLAN_ID,
  revisionId: REVISION_ID,
  revisionNumber: 2,
  createdAt: '2026-11-02T10:00:00.000Z',
  content,
};

describe('Plan Core client', () => {
  it('parses root, draft, and wire revision DTOs with same plan identity', async () => {
    const transport: PlanCoreTransport = {
      create: vi.fn(),
      getRoot: vi.fn().mockResolvedValue({
        status: 'ok',
        replayed: false,
        data: {
          planId: PLAN_ID,
          publishedVersion: 2,
          readiness: 'published',
          draft: { planId: PLAN_ID, visibility: 'private', content },
          currentRevision: {
            planId: revision.planId,
            revisionId: revision.revisionId,
            revisionNumber: revision.revisionNumber,
            createdAt: revision.createdAt,
          },
        },
      }),
      writeDraft: vi.fn(),
      publish: vi.fn(),
    };
    const client = createPlanCoreClient(transport);

    const result = await client.getRoot(PLAN_ID);

    expect(result.status).toBe('ok');
    expect(result.data.planId).toBe(PLAN_ID);
    expect(result.data.draft?.visibility).toBe('private');
    expect(result.data.currentRevision?.revisionNumber).toBe(2);
    expect(result.data.currentRevision?.createdAt).toBe(revision.createdAt);
    expect(transport.getRoot).toHaveBeenCalledWith(PLAN_ID);
  });

  it('uses one autosave/Save as Draft request shape and passes replayed through', async () => {
    const transport: PlanCoreTransport = {
      create: vi.fn(),
      getRoot: vi.fn(),
      writeDraft: vi.fn().mockResolvedValue({
        status: 'ok',
        replayed: true,
        data: {
          planId: PLAN_ID,
          draft: { planId: PLAN_ID, visibility: 'private', content },
        },
      }),
      publish: vi.fn(),
    };
    const client = createPlanCoreClient(transport);

    const result = await client.writeDraft({
      planId: PLAN_ID,
      expectedDraftRevision: 4,
      content,
      operationKey: OPERATION_KEY,
      intent: 'autosave',
    });

    expect(result).toEqual({
      status: 'ok',
      replayed: true,
      data: {
        planId: PLAN_ID,
        draft: expect.objectContaining({ planId: PLAN_ID }),
      },
    });
    expect(transport.writeDraft).toHaveBeenCalledWith({
      planId: PLAN_ID,
      expectedDraftRevision: 4,
      content,
      operationKey: OPERATION_KEY,
      intent: 'autosave',
    });
  });

  it('rejects a draft result that changes the Plan ID', async () => {
    const transport: PlanCoreTransport = {
      create: vi.fn(),
      getRoot: vi.fn(),
      writeDraft: vi.fn().mockResolvedValue({
        status: 'ok',
        replayed: false,
        data: {
          planId: REVISION_ID,
          draft: { planId: REVISION_ID, visibility: 'private' },
        },
      }),
      publish: vi.fn(),
    };

    await expect(
      createPlanCoreClient(transport).writeDraft({
        planId: PLAN_ID,
        expectedDraftRevision: 0,
        content,
        operationKey: OPERATION_KEY,
        intent: 'save_draft',
      }),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('publishes with expectedPublishedVersion only and retains the Plan ID', async () => {
    const transport: PlanCoreTransport = {
      create: vi.fn(),
      getRoot: vi.fn(),
      writeDraft: vi.fn(),
      publish: vi.fn().mockResolvedValue({
        status: 'ok',
        replayed: false,
        data: { planId: PLAN_ID, revision },
      }),
    };
    const client = createPlanCoreClient(transport);

    const result = await client.publish({
      planId: PLAN_ID,
      expectedPublishedVersion: 1,
      operationKey: OPERATION_KEY,
    });

    expect(result.data.planId).toBe(PLAN_ID);
    expect(result.data.revision.revisionId).toBe(REVISION_ID);
    expect(Object.isFrozen(result.data.revision)).toBe(true);
    expect(Object.isFrozen(result.data.revision.content.document)).toBe(true);
    expect(transport.publish).toHaveBeenCalledWith({
      planId: PLAN_ID,
      expectedPublishedVersion: 1,
      operationKey: OPERATION_KEY,
    });
  });

  it('rejects version and publishedVersion as publish inputs before transport', async () => {
    const publish = vi.fn();
    const client = createPlanCoreClient({
      create: vi.fn(),
      getRoot: vi.fn(),
      writeDraft: vi.fn(),
      publish,
    });

    for (const extra of [{ version: 2 }, { publishedVersion: 2 }]) {
      await expect(
        client.publish({
          planId: PLAN_ID,
          expectedPublishedVersion: 1,
          operationKey: OPERATION_KEY,
          ...extra,
        } as never),
      ).rejects.toMatchObject({ code: 'invalid_input' });
    }
    expect(publish).not.toHaveBeenCalled();
  });

  it('maps local invalid_plan_core validation to invalid_input', async () => {
    const client = createPlanCoreClient({
      create: vi.fn(),
      getRoot: vi.fn(),
      writeDraft: vi.fn(),
      publish: vi.fn(),
    });

    await expect(client.getRoot('not-a-plan-id')).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });

  it('accepts schemaVersion as a finite number', async () => {
    const contentWithNumericSchemaVersion = { ...content, schemaVersion: 1.5 };
    const transport: PlanCoreTransport = {
      create: vi.fn(),
      getRoot: vi.fn(),
      writeDraft: vi.fn().mockResolvedValue({
        status: 'ok',
        replayed: false,
        data: {
          planId: PLAN_ID,
          draft: {
            planId: PLAN_ID,
            visibility: 'private',
            content: contentWithNumericSchemaVersion,
          },
        },
      }),
      publish: vi.fn(),
    };

    const result = await createPlanCoreClient(transport).writeDraft({
      planId: PLAN_ID,
      expectedDraftRevision: 0,
      content: contentWithNumericSchemaVersion,
      operationKey: OPERATION_KEY,
      intent: 'autosave',
    });

    expect(result.data.draft.content?.schemaVersion).toBe(1.5);
  });

  it('maps an unknown server status to the closed unavailable error', async () => {
    const transport: PlanCoreTransport = {
      create: vi.fn(),
      getRoot: vi
        .fn()
        .mockResolvedValue({ status: 'future_secret_error', detail: 'hidden' }),
      writeDraft: vi.fn(),
      publish: vi.fn(),
    };

    await expect(
      createPlanCoreClient(transport).getRoot(PLAN_ID),
    ).rejects.toBeInstanceOf(PlanCoreClientError);
    await expect(
      createPlanCoreClient(transport).getRoot(PLAN_ID),
    ).rejects.toMatchObject({
      code: 'unavailable',
      message: 'Plan Core request unavailable',
    });
  });

  it('maps known status failures without exposing server detail text', async () => {
    const client = createPlanCoreClient({
      create: vi.fn(),
      getRoot: vi.fn().mockResolvedValue({
        status: 'not_permitted',
        detail: 'private detail',
      }),
      writeDraft: vi.fn(),
      publish: vi.fn(),
    });

    await expect(client.getRoot(PLAN_ID)).rejects.toMatchObject({
      code: 'not_permitted',
      message: 'Plan Core request not permitted',
    });
  });
});

it('creates a new plan through the explicit create transport', async () => {
  const create = vi.fn().mockResolvedValue({
    status: 'ok',
    replayed: false,
    data: { planId: PLAN_ID, readiness: 'draft' },
  });
  const client = createPlanCoreClient({
    getRoot: vi.fn(),
    writeDraft: vi.fn(),
    publish: vi.fn(),
    create,
  });
  await client.create({
    createMode: 'blank',
    kind: 'workout',
    operationKey: OPERATION_KEY,
  });
  expect(create).toHaveBeenCalledWith({
    createMode: 'blank',
    kind: 'workout',
    operationKey: OPERATION_KEY,
  });
});

it('requires mode-specific create IDs and rejects IDs on other modes', async () => {
  const create = vi.fn();
  const client = createPlanCoreClient({
    getRoot: vi.fn(),
    writeDraft: vi.fn(),
    publish: vi.fn(),
    create,
  });
  const cases = [
    { createMode: 'template', kind: 'workout', operationKey: OPERATION_KEY },
    {
      createMode: 'existing_plan',
      kind: 'nutrition',
      operationKey: OPERATION_KEY,
    },
    {
      createMode: 'blank',
      kind: 'workout',
      operationKey: OPERATION_KEY,
      templateId: PLAN_ID,
    },
    {
      createMode: 'blank',
      kind: 'workout',
      operationKey: OPERATION_KEY,
      sourcePlanId: PLAN_ID,
    },
    {
      createMode: 'template',
      kind: 'workout',
      operationKey: OPERATION_KEY,
      templateId: PLAN_ID,
      sourcePlanId: REVISION_ID,
    },
  ];
  for (const request of cases) {
    await expect(client.create(request)).rejects.toMatchObject({
      code: 'invalid_input',
    });
  }
  expect(create).not.toHaveBeenCalled();
});
