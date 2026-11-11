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
  /** operation-key ledger: retained across calls (nutrition-api §3) */
  receipts: Map<string, Receipt>;
  /** The plan of PLAN_CLIENT: the only plan this client may select in. */
  ownPlanId: string;
  /** Published revision → owning plan id (plan ownership authority). */
  planIdByRevision: Record<string, string>;
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
  | {
      status: 'ok';
      selectionRevision: number;
      noop: boolean;
      selectedAlternativeId: string | null;
    }
  | { status: 'not_permitted' }
  | { status: 'stale_version' }
  | { status: 'invalid_selection' }
  | { status: 'key_conflict' };

type Receipt = { hash: string; result: SelectionStatus };

/** Deterministic canonical request hash bound to the request arguments. */
function canonicalHashOf(request: SelectionRequest): string {
  // JSON encoding: unambiguous (no delimiter collisions; null and the string
  // "null" encode differently)
  return JSON.stringify([
    'client.nutrition_select',
    request.planVersionId,
    request.itemId,
    request.alternativeId,
    request.auth.authUid,
    request.auth.role,
  ]);
}

/** Operation keys are client UUIDv4s bound to the action (nutrition-api §3). */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    receipts: new Map(),
    ownPlanId: 'plan-1',
    planIdByRevision: { 4: 'plan-1', 5: 'plan-1' },
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
): SelectionStatus {
  // 0. operation-key format validation before any lookup or write
  if (!UUID_V4_RE.test(request.operationKey)) {
    world.auditEvents.push({ action: 'client.nutrition_select', denial: true });
    return { status: 'not_permitted' };
  }
  // 1. resolve the client from authentication, the plan ownership of the
  //    requested revision, and require a current subscription
  //    (nutrition-api §4.1) BEFORE any revision or receipt lookup
  const clientId = clientOf(world, request.auth);
  const revisionPlan = world.planIdByRevision[String(request.planVersionId)];
  if (
    !clientId ||
    !world.subscriptionActive ||
    revisionPlan === undefined ||
    revisionPlan !== world.ownPlanId
  ) {
    world.auditEvents.push({ action: 'client.nutrition_select', denial: true });
    return { status: 'not_permitted' };
  }
  // 2. idempotency lookup after authorization: same key + same canonical
  //    request hash returns the original stored result; a different hash is
  //    a key_conflict with the required denial audit (nutrition-api §3)
  const existing = world.receipts.get(request.operationKey);
  if (existing) {
    if (existing.hash !== canonicalHashOf(request)) {
      world.auditEvents.push({
        action: 'client.nutrition_select',
        denial: true,
      });
      return { status: 'key_conflict' };
    }
    // authorization rechecked above: return the complete original result
    return existing.result;
  }
  // 3. require the current published, delivered revision (generic failure
  //    with a denial audit and no domain change)
  if (
    request.planVersionId !== world.currentRevisionId ||
    request.planVersionId !== world.deliveredRevisionId
  ) {
    world.auditEvents.push({ action: 'client.nutrition_select', denial: true });
    const staleResult: SelectionStatus = { status: 'stale_version' };
    world.receipts.set(request.operationKey, {
      hash: canonicalHashOf(request),
      result: staleResult,
    });
    return staleResult;
  }
  // 4. item must exist (own property only) and the alternative must be in
  //    its approved list
  const itemExists = Object.prototype.hasOwnProperty.call(
    world.itemAlternatives,
    request.itemId,
  );
  const approved = itemExists
    ? world.itemAlternatives[request.itemId]
    : undefined;
  if (
    !approved ||
    (request.alternativeId !== null &&
      !approved.includes(request.alternativeId))
  ) {
    world.auditEvents.push({ action: 'client.nutrition_select', denial: true });
    const invalidResult: SelectionStatus = { status: 'invalid_selection' };
    world.receipts.set(request.operationKey, {
      hash: canonicalHashOf(request),
      result: invalidResult,
    });
    return invalidResult;
  }
  const key = selectionKey(request.planVersionId, request.itemId);
  const current = world.selections[key];
  // 5. no-op: selecting the already-selected alternative or clearing when
  //    nothing is selected writes nothing and audits nothing, but the
  //    operation key records the result (nutrition-api §4.4)
  const isNoopSelect =
    request.alternativeId !== null &&
    current?.alternativeId === request.alternativeId;
  const isNoopClear = request.alternativeId === null && !current;
  if (isNoopSelect || isNoopClear) {
    const noopResult: SelectionStatus = {
      status: 'ok',
      selectionRevision: world.counters[String(request.planVersionId)] ?? 0,
      noop: true,
      selectedAlternativeId: current?.alternativeId ?? null,
    };
    world.receipts.set(request.operationKey, {
      hash: canonicalHashOf(request),
      result: noopResult,
    });
    return noopResult;
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
    selectedAlternativeId: request.alternativeId,
  };
  world.receipts.set(request.operationKey, {
    hash: canonicalHashOf(request),
    result: status,
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
    const invalidRequest = clientRequest({ alternativeId: 'a-9' });
    const result = selectNutritionAlternative(world, invalidRequest);
    expect(result.status).toBe('invalid_selection');
    const conflict = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: invalidRequest.operationKey,
        canonicalRequest: 'hash-valid-alternative',
        alternativeId: 'a-1',
      }),
    );
    expect(conflict.status).toBe('key_conflict');
    expect(world.selections['5:i-1']).toBeUndefined();
    expect(world.counters['5']).toBeUndefined();
    expect(world.auditEvents).toEqual([
      { action: 'client.nutrition_select', denial: true },
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
    world.itemAlternatives['i-2'] = ['a-1', 'a-2'];
    const first = selectNutritionAlternative(world, clientRequest());
    expect(first).toMatchObject({
      status: 'ok',
      selectionRevision: 1,
      noop: false,
    });
    const cleared = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-2222-4222-8333-444455556666',
        canonicalRequest: 'hash-1b',
        alternativeId: null,
      }),
    );
    expect(cleared).toMatchObject({
      status: 'ok',
      selectionRevision: 2,
      noop: false,
      selectedAlternativeId: null,
    });
    // the row is deleted (clear-to-default) but the counter is retained
    expect(world.selections['5:i-1']).toBeUndefined();
    expect(world.counters['5']).toBe(2);
    const reselected = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-3333-4222-8333-444455556666',
        canonicalRequest: 'hash-2',
        itemId: 'i-2',
        alternativeId: 'a-1',
      }),
    );
    expect(reselected).toMatchObject({
      status: 'ok',
      selectionRevision: 3,
      noop: false,
    });
    expect(world.selections['5:i-2']!.alternativeId).toBe('a-1');
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
      selectNutritionAlternative(
        world,
        clientRequest({
          operationKey: '5e1c1d2e-aaaa-4222-8333-444455556666',
          planVersionId: 4,
        }),
      ).status,
    ).toBe('stale_version');
    expect(
      selectNutritionAlternative(
        world,
        clientRequest({
          operationKey: '5e1c1d2e-bbbb-4222-8333-444455556666',
          alternativeId: 'a-9',
        }),
      ).status,
    ).toBe('invalid_selection');
    expect(
      selectNutritionAlternative(
        world,
        clientRequest({
          operationKey: '5e1c1d2e-cccc-4222-8333-444455556666',
          auth: { authUid: 'x', role: 'client' },
        }),
      ).status,
    ).toBe('not_permitted');
    // each denial wrote exactly one denial audit and no selection row
    expect(world.auditEvents).toHaveLength(3);
    for (const event of world.auditEvents) expect(event.denial).toBe(true);
    expect(world.selections['5:i-1']).toBeUndefined();
  });

  it('checks the subscription before revision and receipt lookups (expired client)', () => {
    const world = freshWorld();
    // an expired client with a stale revision receives not_permitted, not
    // stale_version: the subscription is part of the authorization step
    world.subscriptionActive = false;
    expect(
      selectNutritionAlternative(world, clientRequest({ planVersionId: 4 }))
        .status,
    ).toBe('not_permitted');
    // an expired client cannot replay a prior receipt either
    const priorWorld = freshWorld();
    selectNutritionAlternative(priorWorld, clientRequest());
    priorWorld.subscriptionActive = false;
    const replay = selectNutritionAlternative(priorWorld, clientRequest());
    expect(replay.status).toBe('not_permitted');
    expect(priorWorld.selections['5:i-1']).toEqual({
      alternativeId: 'a-2',
      createdBy: PLAN_CLIENT,
    });
  });

  it('rejects the same key with a changed request as key_conflict with a denial audit', () => {
    const world = freshWorld();
    const first = selectNutritionAlternative(world, clientRequest());
    expect(first.status).toBe('ok');
    const conflict = selectNutritionAlternative(
      world,
      clientRequest({ alternativeId: 'a-1' }),
    );
    expect(conflict.status).toBe('key_conflict');
    // the changed payload did not write and the denial is audited
    expect(world.selections['5:i-1']!.alternativeId).toBe('a-2');
    expect(world.counters['5']).toBe(1);
    expect(world.auditEvents.filter((e) => e.denial)).toEqual([
      { action: 'client.nutrition_select', denial: true },
    ]);
  });

  it('returns the original stored result on an exact-key replay', () => {
    const world = freshWorld();
    const first = selectNutritionAlternative(world, clientRequest());
    expect(first).toEqual({
      status: 'ok',
      selectionRevision: 1,
      noop: false,
      selectedAlternativeId: 'a-2',
    });
    const replay = selectNutritionAlternative(world, clientRequest());
    expect(replay).toEqual(first);
    expect(world.counters['5']).toBe(1);
    // a no-op result replays as the no-op it was
    selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-2222-4222-8333-444455556666',
        alternativeId: 'a-2',
      }),
    );
    const noopFirst = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-dddd-4222-8333-444455556666',
        alternativeId: 'a-2',
      }),
    );
    expect(noopFirst).toMatchObject({ status: 'ok', noop: true });
    const noopReplay = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-dddd-4222-8333-444455556666',
        alternativeId: 'a-2',
      }),
    );
    expect(noopReplay).toEqual(noopFirst);
  });

  it('records a no-op result under its key so a retry does not write', () => {
    const world = freshWorld();
    const noopClear = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-eeee-4222-8333-444455556666',
        alternativeId: null,
      }),
    );
    expect(noopClear).toMatchObject({
      status: 'ok',
      noop: true,
      selectionRevision: 0,
      selectedAlternativeId: null,
    });
    // a different key selects a-1; retrying the no-op key must return the
    // recorded no-op without deleting the new selection
    selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-ffff-4222-8333-444455556666',
        alternativeId: 'a-1',
      }),
    );
    expect(world.selections['5:i-1']!.alternativeId).toBe('a-1');
    expect(world.counters['5']).toBe(1);
    const retry = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-eeee-4222-8333-444455556666',
        alternativeId: null,
      }),
    );
    expect(retry).toEqual(noopClear);
    expect(world.selections['5:i-1']!.alternativeId).toBe('a-1');
    expect(world.counters['5']).toBe(1);
  });

  it('rejects inherited item names as invalid selections', () => {
    const world = freshWorld();
    const result = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-9999-4222-8333-444455556666',
        itemId: 'constructor',
      }),
    );
    expect(result.status).toBe('invalid_selection');
    expect(world.auditEvents).toEqual([
      { action: 'client.nutrition_select', denial: true },
    ]);
    expect(world.counters['5']).toBeUndefined();
  });

  it('rejects a malformed operation key before any lookup or write', () => {
    const world = freshWorld();
    const result = selectNutritionAlternative(
      world,
      clientRequest({ operationKey: 'not-a-uuid' }),
    );
    expect(result.status).toBe('not_permitted');
    expect(world.auditEvents).toEqual([
      { action: 'client.nutrition_select', denial: true },
    ]);
    expect(world.selections['5:i-1']).toBeUndefined();
    expect(world.counters['5']).toBeUndefined();
    expect(world.receipts.size).toBe(0);
  });

  it('rejects a revision owned by a different plan generically', () => {
    const world = freshWorld();
    // revision 9 was published for a plan of another client
    world.planIdByRevision[9] = 'plan-other';
    const result = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-7777-4222-8333-444455556666',
        planVersionId: 9,
      }),
    );
    expect(result.status).toBe('not_permitted');
    expect(world.auditEvents).toEqual([
      { action: 'client.nutrition_select', denial: true },
    ]);
    expect(world.selections['9:i-1']).toBeUndefined();
    expect(world.counters['9']).toBeUndefined();
  });

  it('encodes clear and the alternative id "null" without collision (key_conflict)', () => {
    const world = freshWorld();
    // select a-1 first, then clear it with a distinct key: the clear result
    // is stored under its canonical hash
    selectNutritionAlternative(world, clientRequest({ alternativeId: 'a-1' }));
    const cleared = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-2222-4222-8333-444455556666',
        alternativeId: null,
      }),
    );
    expect(cleared.status).toBe('ok');
    // the same key + alternativeId 'null' (a valid string id) has a different
    // canonical hash than the clear: it must be a key_conflict, not a replay
    const collision = selectNutritionAlternative(
      world,
      clientRequest({
        operationKey: '5e1c1d2e-2222-4222-8333-444455556666',
        itemId: 'i-1',
        alternativeId: 'null',
      }),
    );
    expect(collision.status).toBe('key_conflict');
    // nothing was written for the colliding request
    expect(world.selections['5:i-1']).toBeUndefined();
    expect(world.counters['5']).toBe(2);
  });
});
