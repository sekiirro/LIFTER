import { describe, expect, it } from 'vitest';

/**
 * T004 — Selection contract test (F18-FR-011..013, F18-FR-016).
 *
 * Contract: `specs/018-nutrition-planner/contracts/nutrition-api.md` §4 and
 * §8; `data-model.md` §3. Frozen RPC-boundary contract that the database
 * selection RPC (T010) must satisfy. The reference model below encodes the
 * selection state machine, the durable per-revision counter semantics, and
 * the generic-failure + denial-audit rules.
 */

const PLAN_CLIENT = 'client-1';
const STAFF = 'staff-1';

type SelectionRow = { alternativeId: string; createdBy: string };

type SelectionWorld = {
  revisionBytes: string;
  currentRevisionId: number;
  deliveredRevisionId: number;
  subscriptionActive: boolean;
  itemAlternatives: Record<string, string[]>;
  selections: Record<string, SelectionRow>; // `${revisionId}:${itemId}`
  counters: Record<string, number>; // per revisionId
  auditEvents: Array<{ action: string; denial?: boolean }>;
};

type AuthContext = {
  authUid: string;
  role: 'client' | 'trainer' | 'workspace_owner' | 'platform_owner' | 'sales';
  // forged caller-supplied identity (never authority)
  suppliedClientId?: string;
};

type SelectionRequest = {
  operationKey: string;
  canonicalRequest: string;
  planVersionId: number;
  itemId: string;
  alternativeId: string | null;
  auth: AuthContext;
};

type SelectionStatus =
  | { status: 'ok'; selectionRevision: number; noop: boolean }
  | { status: 'not_permitted' }
  | { status: 'stale_version' }
  | { status: 'invalid_selection' }
  | { status: 'key_conflict' };

type Receipt = { status: SelectionStatus['status']; selectionRevision: number };

function freshWorld(): SelectionWorld {
  return {
    revisionBytes: 'coach-authored-revision-bytes@revision-5',
    currentRevisionId: 5,
    deliveredRevisionId: 5,
    subscriptionActive: true,
    itemAlternatives: {
      'i-1': ['a-1', 'a-2'],
    },
    selections: {},
    counters: {},
    auditEvents: [],
  };
}

function clientRequest(
  overrides: Partial<SelectionRequest> = {},
): SelectionRequest {
  return {
    operationKey: '5e1c1d2e-1111-4222-8333-444455556666',
    canonicalRequest: 'hash-1',
    planVersionId: 5,
    itemId: 'i-1',
    alternativeId: 'a-2',
    auth: { authUid: PLAN_CLIENT, role: 'client' },
    ...overrides,
  };
}

function clientOf(world: SelectionWorld, auth: AuthContext): string | null {
  // the client is resolved from authentication only; a caller-supplied
  // client/workspace id is never authority (F18-FR-011)
  void auth.suppliedClientId;
  if (auth.role !== 'client') return null;
  // in the merged system the plan root binds the authenticated client; the
  // model treats authUid === PLAN_CLIENT as the plan's own client
  return auth.authUid === PLAN_CLIENT ? PLAN_CLIENT : null;
}

function selectionKey(revisionId: number, itemId: string): string {
  return `${revisionId}:${itemId}`;
}

function selectNutritionAlternative(
  world: SelectionWorld,
  request: SelectionRequest,
  receipts: Map<string, Receipt> = new Map(),
): SelectionStatus {
  // 1. resolve the client from authentication; self only
  const clientId = clientOf(world, request.auth);
  if (!clientId) {
    world.auditEvents.push({ action: 'client.nutrition_select', denial: true });
    return { status: 'not_permitted' };
  }
  // 2. idempotency lookup after authorization
  const existing = receipts.get(request.operationKey);
  if (existing) {
    if (request.canonicalRequest !== 'hash-replay-same') {
      return { status: 'key_conflict' };
    }
    // the original result is returned after the authorization recheck above
    if (existing.status === 'ok') {
      return {
        status: 'ok',
        selectionRevision: existing.selectionRevision,
        noop: true,
      };
    }
    return { status: existing.status };
  }
  // 3. require the current published, delivered revision (generic failure
  //    with a denial audit and no domain change)
  if (
    request.planVersionId !== world.currentRevisionId ||
    request.planVersionId !== world.deliveredRevisionId
  ) {
    world.auditEvents.push({ action: 'client.nutrition_select', denial: true });
    receipts.set(request.operationKey, {
      status: 'stale_version',
      selectionRevision: world.counters[String(request.planVersionId)] ?? 0,
    });
    return { status: 'stale_version' };
  }
  // 4. current subscription (F13/F19 entitlement)
  if (!world.subscriptionActive) {
    world.auditEvents.push({ action: 'client.nutrition_select', denial: true });
    return { status: 'not_permitted' };
  }
  // 5. item must exist and the alternative must be in its approved list
  const approved = world.itemAlternatives[request.itemId];
  if (
    !approved ||
    (request.alternativeId !== null &&
      !approved.includes(request.alternativeId))
  ) {
    world.auditEvents.push({ action: 'client.nutrition_select', denial: true });
    return { status: 'invalid_selection' };
  }
  const key = selectionKey(request.planVersionId, request.itemId);
  const current = world.selections[key];
  // 6. no-op: selecting the already-selected alternative or clearing when
  //    nothing is selected writes nothing and audits nothing
  const isNoopSelect =
    request.alternativeId !== null &&
    current?.alternativeId === request.alternativeId;
  const isNoopClear = request.alternativeId === null && !current;
  if (isNoopSelect || isNoopClear) {
    return {
      status: 'ok',
      selectionRevision: world.counters[String(request.planVersionId)] ?? 0,
      noop: true,
    };
  }
  // 7. real change: upsert/delete the row and increment the durable
  //    per-revision counter exactly once; the counter survives deletion
  if (request.alternativeId === null) {
    delete world.selections[key];
  } else {
    world.selections[key] = {
      alternativeId: request.alternativeId,
      createdBy: clientId,
    };
  }
  const counterKey = String(request.planVersionId);
  world.counters[counterKey] = (world.counters[counterKey] ?? 0) + 1;
  world.auditEvents.push({ action: 'client.nutrition_select' });
  const status: SelectionStatus = {
    status: 'ok',
    selectionRevision: world.counters[counterKey]!,
    noop: false,
  };
  receipts.set(request.operationKey, {
    status: 'ok',
    selectionRevision: status.selectionRevision,
  });
  return status;
}

describe('nutrition selection contract (F18-FR-011..013, T004)', () => {
  it('stores ids only and never mutates the coach-authored revision bytes', () => {
    const world = freshWorld();
    const result = selectNutritionAlternative(world, clientRequest());
    expect(result.status).toBe('ok');
    expect(world.revisionBytes).toBe(
      'coach-authored-revision-bytes@revision-5',
    );
    expect(world.selections['5:i-1']).toEqual({
      alternativeId: 'a-2',
      createdBy: PLAN_CLIENT,
    });
  });

  it('rejects an alternative id not in the item approved list (invalid_selection)', () => {
    const world = freshWorld();
    const result = selectNutritionAlternative(
      world,
      clientRequest({ alternativeId: 'a-9' }),
    );
    expect(result.status).toBe('invalid_selection');
    expect(world.selections['5:i-1']).toBeUndefined();
    expect(world.auditEvents).toEqual([
      { action: 'client.nutrition_select', denial: true },
    ]);
  });

  it('rejects a stale revision generically with a denial audit and no write', () => {
    const world = freshWorld();
    const result = selectNutritionAlternative(
      world,
      clientRequest({ planVersionId: 4 }),
    );
    expect(result.status).toBe('stale_version');
    expect(world.selections['4:i-1']).toBeUndefined();
    expect(world.auditEvents).toHaveLength(1);
    expect(world.auditEvents[0]!.denial).toBe(true);
  });

  it('derives the client from authentication and ignores a supplied client id', () => {
    const world = freshWorld();
    const result = selectNutritionAlternative(
      world,
      clientRequest({
        auth: {
          authUid: 'client-other',
          role: 'client',
          suppliedClientId: PLAN_CLIENT,
        },
      }),
    );
    expect(result.status).toBe('not_permitted');
    expect(world.selections['5:i-1']).toBeUndefined();
    expect(world.auditEvents).toHaveLength(1);
  });

  it('denies staff actors: selection is client self-only (coach-source overwrite refused)', () => {
    const world = freshWorld();
    for (const role of [
      'trainer',
      'workspace_owner',
      'platform_owner',
      'sales',
    ] as const) {
      const attempt = selectNutritionAlternative(
        world,
        clientRequest({ auth: { authUid: STAFF, role } }),
      );
      expect(attempt.status).toBe('not_permitted');
    }
    expect(world.selections['5:i-1']).toBeUndefined();
    expect(world.revisionBytes).toBe(
      'coach-authored-revision-bytes@revision-5',
    );
  });

  it('denies an expired subscription with a denial audit and no write', () => {
    const world = freshWorld();
    world.subscriptionActive = false;
    const result = selectNutritionAlternative(world, clientRequest());
    expect(result.status).toBe('not_permitted');
    expect(world.selections['5:i-1']).toBeUndefined();
    expect(world.auditEvents).toEqual([
      { action: 'client.nutrition_select', denial: true },
    ]);
  });

  it('advances the durable per-revision counter on clear then select', () => {
    const world = freshWorld();
    const first = selectNutritionAlternative(world, clientRequest());
    expect(first).toMatchObject({
      status: 'ok',
      selectionRevision: 1,
      noop: false,
    });
    const cleared = selectNutritionAlternative(
      world,
      clientRequest({ alternativeId: null }),
    );
    expect(cleared).toMatchObject({
      status: 'ok',
      selectionRevision: 2,
      noop: false,
    });
    // the row is deleted (clear-to-default) but the counter is retained
    expect(world.selections['5:i-1']).toBeUndefined();
    expect(world.counters['5']).toBe(2);
    const reselected = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-3333-4222-8333-444455556666',
        canonicalRequest: 'hash-2',
        alternativeId: 'a-1',
      }),
    );
    expect(reselected).toMatchObject({
      status: 'ok',
      selectionRevision: 3,
      noop: false,
    });
    expect(world.selections['5:i-1']!.alternativeId).toBe('a-1');
  });

  it('treats a re-select of the current alternative and a clear of nothing as no-ops', () => {
    const world = freshWorld();
    selectNutritionAlternative(world, clientRequest());
    const auditsAfterSelect = world.auditEvents.length;
    const noopSelect = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-2222-4222-8333-444455556666',
        canonicalRequest: 'hash-1b',
      }),
    );
    expect(noopSelect).toMatchObject({
      status: 'ok',
      noop: true,
      selectionRevision: 1,
    });
    expect(world.auditEvents).toHaveLength(auditsAfterSelect);
    expect(world.counters['5']).toBe(1);
    // clearing when nothing is selected is a successful no-op: no row, no
    // counter, no audit event (the operation key still records the result)
    const untouched = freshWorld();
    const noopClear = selectNutritionAlternative(
      untouched,
      clientRequest({
        operationKey: '5e1c1d2e-4444-4222-8333-444455556666',
        canonicalRequest: 'hash-1c',
        alternativeId: null,
      }),
    );
    expect(noopClear).toMatchObject({
      status: 'ok',
      noop: true,
      selectionRevision: 0,
    });
    expect(untouched.counters['5']).toBeUndefined();
    expect(untouched.selections['5:i-1']).toBeUndefined();
    expect(untouched.auditEvents).toHaveLength(0);
  });

  it('clearing restores the coach default and is audited once', () => {
    const world = freshWorld();
    selectNutritionAlternative(world, clientRequest());
    const clear = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-5555-4222-8333-444455556666',
        canonicalRequest: 'hash-2',
        alternativeId: null,
      }),
    );
    expect(clear.status).toBe('ok');
    expect(world.selections['5:i-1']).toBeUndefined();
    const successes = world.auditEvents.filter((e) => !e.denial);
    expect(successes).toHaveLength(2);
  });

  it('switching between approved alternatives changes the selection', () => {
    const world = freshWorld();
    selectNutritionAlternative(world, clientRequest({ alternativeId: 'a-1' }));
    const switched = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-6666-4222-8333-444455556666',
        canonicalRequest: 'hash-2',
        alternativeId: 'a-2',
      }),
    );
    expect(switched).toMatchObject({
      status: 'ok',
      selectionRevision: 2,
      noop: false,
    });
    expect(world.selections['5:i-1']!.alternativeId).toBe('a-2');
  });

  it('fails generically with no partial write on every unauthorized path', () => {
    const world = freshWorld();
    expect(
      selectNutritionAlternative(world, clientRequest({ planVersionId: 4 }))
        .status,
    ).toBe('stale_version');
    expect(
      selectNutritionAlternative(world, clientRequest({ alternativeId: 'a-9' }))
        .status,
    ).toBe('invalid_selection');
    expect(
      selectNutritionAlternative(
        world,
        clientRequest({ auth: { authUid: 'x', role: 'client' } }),
      ).status,
    ).toBe('not_permitted');
    // each denial wrote exactly one denial audit and no selection row
    expect(world.auditEvents).toHaveLength(3);
    for (const event of world.auditEvents) expect(event.denial).toBe(true);
    expect(world.selections['5:i-1']).toBeUndefined();
  });
});
