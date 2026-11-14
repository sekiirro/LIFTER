import { describe, expect, it } from 'vitest';
import {
  mapPlanRpcError,
  type CreatePlanRequest,
  type DraftWriteRequest,
  type ReadyAndPublishRequest,
} from '../../lib/plans/client-contract';

describe('F19 shared client contract', () => {
  it('maps database failures to closed client statuses', () => {
    expect(
      mapPlanRpcError({ code: '42501', message: 'not_permitted' }),
    ).toEqual({
      status: 'not_permitted',
    });
    expect(
      mapPlanRpcError({ code: '22023', message: 'invalid_input' }),
    ).toEqual({
      status: 'invalid_input',
    });
    expect(
      mapPlanRpcError({ code: '40001', message: 'stale_version' }),
    ).toEqual({
      status: 'stale_version',
    });
    expect(mapPlanRpcError({ code: '23505', message: 'key_conflict' })).toEqual(
      {
        status: 'key_conflict',
      },
    );
    expect(mapPlanRpcError({ code: '55000', message: 'unavailable' })).toEqual({
      status: 'unavailable',
    });
    expect(
      mapPlanRpcError({ code: 'XX000', message: 'private database detail' }),
    ).toEqual({
      status: 'unavailable',
    });
  });

  it('exposes explicit mutually-exclusive create modes and CAS fields', () => {
    const blank: CreatePlanRequest = {
      createMode: 'blank',
      clientId: 'client-id',
      kind: 'workout',
      operationKey: 'operation-key',
    };
    const copied: CreatePlanRequest = {
      createMode: 'existing_plan',
      clientId: 'client-id',
      kind: 'workout',
      sourcePlanId: 'source-plan-id',
      operationKey: 'operation-key',
    };
    const draft: DraftWriteRequest = {
      planId: 'plan-id',
      expectedDraftVersion: 4,
      content: { kind: 'workout', schemaVersion: 2, document: {} },
      operationKey: 'operation-key',
      intent: 'autosave',
    };
    const publish: ReadyAndPublishRequest = {
      planId: 'plan-id',
      expectedDraftVersion: 4,
      expectedPublishedRevision: 2,
      operationKey: 'operation-key',
    };

    expect(blank.createMode).toBe('blank');
    expect(copied.sourcePlanId).toBe('source-plan-id');
    expect(draft.expectedDraftVersion).toBe(4);
    expect(draft.intent).toBe('autosave');
    expect(publish.expectedPublishedRevision).toBe(2);
  });
});
