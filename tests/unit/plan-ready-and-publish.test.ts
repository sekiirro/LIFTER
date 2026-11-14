import { describe, expect, it, vi } from 'vitest';
import {
  mapReadyAndPublishResult,
  parseReadyAndPublishRequest,
  readyAndPublishPlan,
} from '../../lib/plans/ready-and-publish';

// Synthetic identifiers only.
const planId = '11111111-1111-4111-8111-111111111111';
const revisionId = '22222222-2222-4222-8222-222222222222';
const operationKey = '33333333-3333-4333-8333-333333333333';
const request = {
  planId,
  expectedDraftVersion: 1,
  expectedPublishedRevision: 0,
  operationKey,
};

describe('F22 US1 Ready & Publish adapter over F19 (T006 partial; FR-001, SC-001)', () => {
  it('accepts only the F19 ReadyAndPublishRequest shape', () => {
    expect(parseReadyAndPublishRequest(request)).toEqual(request);
    for (const input of [
      null,
      [],
      { ...request, planId: 'x' },
      { ...request, operationKey: undefined },
      { ...request, expectedDraftVersion: 0 },
      { ...request, expectedPublishedRevision: -1 },
      { ...request, expectedDraftVersion: 1.5 },
      { ...request, clientId: planId },
      { ...request, workspaceId: planId },
    ])
      expect(
        parseReadyAndPublishRequest(input),
        JSON.stringify(input),
      ).toBeNull();
  });

  it('maps an F19 receipt to the contract receipt without delivery or subscription ids', () => {
    const result = mapReadyAndPublishResult(
      {
        status: 'ok',
        plan_id: planId,
        revision_id: revisionId,
        revision_number: 1,
        delivery_id: '44444444-4444-4444-8444-444444444444',
        subscription_id: '55555555-5555-4555-8555-555555555555',
      },
      null,
      request,
    );
    expect(result).toEqual({
      status: 'ok',
      receipt: { planId, revisionId, revisionNumber: 1 },
    });
    expect(JSON.stringify(result)).not.toContain('4444');
    expect(JSON.stringify(result)).not.toContain('5555');
  });

  it('keeps F19 closed failures and fails closed on anything else', () => {
    for (const status of [
      'not_permitted',
      'invalid_input',
      'stale_version',
      'key_conflict',
      'unavailable',
    ])
      expect(mapReadyAndPublishResult({ status }, null, request)).toEqual({
        status,
      });
    expect(
      mapReadyAndPublishResult({ status: 'activated' }, null, request),
    ).toEqual({ status: 'unavailable' });
    expect(
      mapReadyAndPublishResult(
        {
          status: 'ok',
          plan_id: revisionId,
          revision_id: revisionId,
          revision_number: 1,
        },
        null,
        request,
      ),
    ).toEqual({ status: 'unavailable' });
    expect(mapReadyAndPublishResult(null, { code: '42501' }, request)).toEqual({
      status: 'not_permitted',
    });
  });

  it('sends the exact F19 arguments and replays with the same operation key', async () => {
    const receipt = {
      status: 'ok',
      plan_id: planId,
      revision_id: revisionId,
      revision_number: 1,
    };
    const rpc = vi.fn(async () => ({ data: receipt, error: null }));
    const first = await readyAndPublishPlan({ rpc }, request);
    const replay = await readyAndPublishPlan({ rpc }, request);
    expect(replay).toEqual(first);
    expect(rpc).toHaveBeenNthCalledWith(1, 'ready_and_publish_plan', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_expected_published_version: 0,
      p_operation_key: operationKey,
    });
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
  });

  it('does not call F19 for an invalid request', async () => {
    const rpc = vi.fn();
    await expect(readyAndPublishPlan({ rpc }, { planId })).resolves.toEqual({
      status: 'invalid_input',
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
