import { describe, expect, it } from 'vitest';
import {
  computeDocumentValues,
  snapshotMapKey,
  type NutritionSnapshotEntry,
  type NutritionSnapshotMap,
} from '../../lib/plans/nutrition/macros';
import type { NutritionQuantityUnit } from '../../lib/plans/nutrition/types';
import {
  NUTRITION_DOCUMENT_SCHEMA_VERSION,
  NutritionDocumentError,
  validateNutritionDocument,
} from '../../lib/plans/nutrition/schema';

/**
 * T003 — Publish "ignore caller data" contract test (F18-FR-005, F18-FR-019).
 *
 * Contract: `specs/018-nutrition-planner/contracts/nutrition-api.md`
 * sections 3, 5 and 8. This is the frozen TS contract at the RPC boundary:
 * the reference model below mirrors the contract's authorize → idempotency
 * lookup → eligibility → validate → recompute → append → audit order so the
 * DB publish task (T009) can be tested against the same fixtures.
 */

// Deterministic frozen food-version registry the "database" loads at publish.
const FOODS: Record<
  string,
  {
    basis: 'g' | 'ml';
    unitKeys: string[];
    /** catalog serving basis quantities per unit key (numeric(12,3) strings) */
    servings: Record<string, string>;
    per100: { kcal: string; protein: string; carbs: string; fat: string };
  }
> = {
  'f1@3': {
    basis: 'g',
    unitKeys: ['g', 'scoop:large'],
    servings: { g: '100.000', 'scoop:large': '250.000' },
    per100: { kcal: '250.0', protein: '12.34', carbs: '50.00', fat: '12.34' },
  },
};

const UNIT_CONTEXT_F1 = {
  [`${'f1'}@3`]: { basis: 'g' as const, servingUnitKeys: ['g', 'scoop:large'] },
  // The catalog's unit-resolution context knows the declared basis and
  // serving identities of the food whose version row is missing from the
  // loadable registry; the publish then fails at the load step (§5/§8).
  [`${'missing-food'}@9`]: { basis: 'g' as const, servingUnitKeys: ['g'] },
};

const DOC_F1 = {
  schemaVersion: NUTRITION_DOCUMENT_SCHEMA_VERSION,
  structure: 'single_day',
  implicitDayTypeId: 'dt-rest',
  dayTypes: [
    {
      id: 'dt-rest',
      name: { ar: 'راحة', en: 'Rest' },
      trainingDay: false,
      targets: null,
    },
  ],
  meals: [
    {
      id: 'm-1',
      name: { ar: 'وجبة', en: 'Meal' },
      note: null,
      recipeUrl: null,
      items: [
        {
          id: 'i-1',
          foodId: 'f1',
          foodVersion: 3,
          quantity: { value: '37', unit: { kind: 'basis', value: 'g' } },
          note: null,
          alternatives: [],
        },
      ],
    },
  ],
  title: null,
  notes: null,
} as const;

function buildSnapshotMap(
  document: ReturnType<typeof parseDocument>,
): NutritionSnapshotMap {
  const map: NutritionSnapshotMap = {};
  const collect = (
    foodId: string,
    foodVersion: number,
    unit: { kind: string; value?: string; unitKey?: string },
  ) => {
    const versionKey = `${foodId}@${foodVersion}`;
    const food = FOODS[versionKey];
    if (!food) return; // missing version is reported by the validator context
    // canonical key builder: RFC 3986 encoding for serving keys (contract §4)
    const key = snapshotMapKey(
      foodId,
      foodVersion,
      unit as NutritionQuantityUnit,
    );
    if (unit.kind === 'basis') {
      map[key] = {
        kind: 'basis',
        foodId,
        version: foodVersion,
        names: { ar: 'طعام', en: 'Food' },
        basis: food.basis,
        productIdentity: 'raw',
        preparationIdentity: 'raw',
        weighingState: 'raw',
        per100: { ...food.per100, fiber: null },
      } satisfies NutritionSnapshotEntry;
      return;
    }
    // serving reference: build the wrapped F16 serving entry with its exact
    // declared basisQuantity so basisQuantityOf never sees a basis entry
    const basisQuantity = food.servings[unit.unitKey ?? ''];
    if (basisQuantity === undefined) {
      throw new Error(`undeclared serving ${unit.unitKey} for ${versionKey}`);
    }
    map[key] = {
      kind: 'serving',
      unitKey: unit.unitKey ?? '',
      snapshot: {
        foodId,
        version: foodVersion,
        names: { ar: 'طعام', en: 'Food' },
        basis: food.basis,
        productIdentity: 'raw',
        preparationIdentity: 'raw',
        weighingState: 'raw',
        kcal: food.per100.kcal,
        protein: food.per100.protein,
        carbs: food.per100.carbs,
        fat: food.per100.fat,
        fiber: null,
        serving: {
          servingId: unit.unitKey ?? '',
          labels: { ar: 'حصة', en: 'Serving' },
          basisQuantity,
        },
      },
    } satisfies NutritionSnapshotEntry;
  };
  const meals =
    document.structure === 'single_day'
      ? (document.meals ?? [])
      : (document.days ?? []).flatMap((d) => d.meals);
  for (const meal of meals) {
    for (const item of meal.items) {
      collect(item.foodId, item.foodVersion, item.quantity.unit as never);
      for (const alt of item.alternatives) {
        collect(alt.foodId, alt.foodVersion, alt.quantity.unit as never);
      }
    }
  }
  return map;
}

function parseDocument(input: unknown) {
  return validateNutritionDocument(input, UNIT_CONTEXT_F1);
}

type PublishReceipt = {
  revisionId: number;
  deliveryId: number;
};

type PublishState = {
  currentRevision: number;
  contents: Array<{
    revisionId: number;
    document: unknown;
    snapshotMap: NutritionSnapshotMap;
    computedValues: unknown;
  }>;
  deliveries: Array<{ revisionId: number }>;
  auditEvents: Array<{ action: string; revisionId?: number }>;
  receipts: Map<string, { hash: string; receipt: PublishReceipt }>;
};

type CallerActor = {
  role: 'platform_owner' | 'workspace_owner' | 'trainer' | 'sales' | 'client';
  workspaceId: string;
};

type PublishRequest = {
  operationKey: string;
  canonicalRequest: string;
  expectedRevision: number;
  /** Caller-supplied document plus any forged snapshots/totals. */
  payload: { document: unknown; snapshots?: unknown; computedTotals?: unknown };
  actor: CallerActor;
  subscriptionActive: boolean;
};

type PublishStatus =
  | { status: 'ok'; receipt: PublishReceipt }
  | { status: 'key_conflict' }
  | { status: 'stale_version' }
  | { status: 'not_permitted' }
  | { status: 'refused_no_subscription' }
  | { status: 'missing_food_version' }
  | { status: 'aborted' };

const PLAN_WORKSPACE = 'ws-1';

function authorized(actor: CallerActor): boolean {
  return (
    actor.role === 'platform_owner' ||
    ((actor.role === 'workspace_owner' || actor.role === 'trainer') &&
      actor.workspaceId === PLAN_WORKSPACE)
  );
}

function collectReferencedFoodVersions(
  document: ReturnType<typeof parseDocument>,
): string[] {
  const meals =
    document.structure === 'single_day'
      ? (document.meals ?? [])
      : (document.days ?? []).flatMap((d) => d.meals);
  const refs = new Set<string>();
  for (const meal of meals) {
    for (const item of meal.items) {
      refs.add(`${item.foodId}@${item.foodVersion}`);
      for (const alt of item.alternatives) {
        refs.add(`${alt.foodId}@${alt.foodVersion}`);
      }
    }
  }
  return [...refs];
}

function publishNutritionRevision(
  state: PublishState,
  request: PublishRequest,
): PublishStatus {
  // 1. application wall: authorize before any read or replay disclosure
  if (!authorized(request.actor)) {
    return { status: 'not_permitted' };
  }
  // 2. idempotency lookup after authorization, before eligibility
  const existing = state.receipts.get(request.operationKey);
  if (existing) {
    if (existing.hash !== request.canonicalRequest) {
      return { status: 'key_conflict' };
    }
    // authorization rechecked above; the original receipt is returned even
    // if the subscription has since expired
    return { status: 'ok', receipt: existing.receipt };
  }
  // 3. new key: the current subscription is resolved first (F19 refuses
  //    the enclosing operation before any nutrition work)
  if (!request.subscriptionActive) {
    return { status: 'refused_no_subscription' };
  }
  // 4. expected revision recheck
  if (request.expectedRevision !== state.currentRevision) {
    return { status: 'stale_version' };
  }
  // 5. frozen schema validator: any validator failure aborts with no revision
  let document: ReturnType<typeof parseDocument>;
  try {
    document = parseDocument(request.payload.document);
  } catch (error) {
    if (error instanceof NutritionDocumentError) {
      return { status: 'aborted' };
    }
    throw error;
  }
  // the committed record is a DETACHED copy: later caller edits to the
  // submitted draft must never change the published revision content
  const committedDocument = structuredClone(document);
  // 6. load every referenced exact food version (items + alternatives); a
  //    missing version aborts the whole transaction with no revision
  for (const foodId of collectReferencedFoodVersions(document)) {
    if (!FOODS[foodId]) {
      return { status: 'missing_food_version' };
    }
  }
  // 7. caller-supplied snapshots/computed totals are NEVER read: the map and
  //    values are rebuilt here from the referenced food versions only
  const snapshotMap = buildSnapshotMap(document);
  const computedValues = computeDocumentValues(document, snapshotMap);
  // 8. append revision + 1:1 content + delivery, then one audit event
  const revisionId = state.currentRevision + 1;
  state.currentRevision = revisionId;
  state.contents.push({
    revisionId,
    document: committedDocument,
    snapshotMap,
    computedValues,
  });
  const deliveryId = revisionId;
  state.deliveries.push({ revisionId });
  state.auditEvents.push({ action: 'plan.nutrition_publish', revisionId });
  const receipt: PublishReceipt = { revisionId, deliveryId };
  state.receipts.set(request.operationKey, {
    hash: request.canonicalRequest,
    receipt,
  });
  return { status: 'ok', receipt };
}
function freshState(): PublishState {
  return {
    currentRevision: 1,
    contents: [],
    deliveries: [],
    auditEvents: [],
    receipts: new Map(),
  };
}

function baseRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    operationKey: '0f3a1b2c-1111-4222-8333-444455556666',
    canonicalRequest: 'hash-1',
    expectedRevision: 1,
    payload: { document: structuredClone(DOC_F1) },
    actor: { role: 'trainer', workspaceId: PLAN_WORKSPACE },
    subscriptionActive: true,
    ...overrides,
  };
}

describe('publish ignore-caller-data contract (F18-FR-005, T003)', () => {
  it('ignores caller-supplied snapshots and totals and stores only database values', () => {
    const state = freshState();
    const result = publishNutritionRevision(
      state,
      baseRequest({
        payload: {
          document: structuredClone(DOC_F1),
          snapshots: { forged: 'caller-snapshot' },
          computedTotals: { kcal: '999999' },
        },
      }),
    );
    expect(result.status).toBe('ok');
    const content = state.contents[0]!;
    expect(JSON.stringify(content)).not.toContain('forged');
    expect(JSON.stringify(content)).not.toContain('caller-snapshot');
    expect(JSON.stringify(content)).not.toContain('999999');
    // database values win: 12.34 × 37 / 100 = 4.5658
    expect(content.snapshotMap['food:f1@3#basis:g']).toBeDefined();
    expect(
      (content.computedValues as { items: Record<string, { protein: string }> })
        .items['i-1']!.protein,
    ).toBe('4.5658');
  });

  it('builds a serving snapshot for a serving-referenced item and publishes successfully', () => {
    const state = freshState();
    const servingDoc = structuredClone(DOC_F1) as Record<string, unknown>;
    const meals = servingDoc.meals as Array<Record<string, unknown>>;
    meals[0]!.items = [
      {
        id: 'i-serving',
        foodId: 'f1',
        foodVersion: 3,
        quantity: { value: '1', unit: { kind: 'serving', unitKey: 'g' } },
        note: null,
        alternatives: [],
      },
    ];
    const result = publishNutritionRevision(
      state,
      baseRequest({ payload: { document: servingDoc } }),
    );
    expect(result.status).toBe('ok');
    const content = state.contents[0]!;
    const servingEntry = content.snapshotMap['food:f1@3#serving:g'];
    expect(servingEntry).toBeDefined();
    expect(servingEntry!.kind).toBe('serving');
    if (servingEntry!.kind === 'serving') {
      expect(servingEntry!.snapshot.serving.basisQuantity).toBe('100.000');
    }
    // 12.34 × 100.000 (basis quantity) × 1 / 100 = 12.34 exactly
    expect(
      (content.computedValues as { items: Record<string, { protein: string }> })
        .items['i-serving']!.protein,
    ).toBe('12.3400000');
  });

  it('publishes a serving key that requires RFC 3986 encoding under its canonical key', () => {
    const state = freshState();
    const encodedDoc = structuredClone(DOC_F1) as Record<string, unknown>;
    const meals = encodedDoc.meals as Array<Record<string, unknown>>;
    meals[0]!.items = [
      {
        id: 'i-encoded',
        foodId: 'f1',
        foodVersion: 3,
        quantity: {
          value: '1',
          unit: { kind: 'serving', unitKey: 'scoop:large' },
        },
        note: null,
        alternatives: [],
      },
    ];
    const result = publishNutritionRevision(
      state,
      baseRequest({ payload: { document: encodedDoc } }),
    );
    expect(result.status).toBe('ok');
    const content = state.contents[0]!;
    // the canonical encoded key holds the entry; the raw key does not exist
    expect(
      content.snapshotMap['food:f1@3#serving:scoop%3Alarge'],
    ).toBeDefined();
    expect(
      content.snapshotMap['food:f1@3#serving:scoop:large'],
    ).toBeUndefined();
    // 12.34 × 250.000 / 100 = 30.85 exactly (scale 2+3+2 = 7)
    expect(
      (content.computedValues as { items: Record<string, { protein: string }> })
        .items['i-encoded']!.protein,
    ).toBe('30.8500000');
  });

  it('stores a detached document: later caller edits never change the committed record', () => {
    const state = freshState();
    const submitted = structuredClone(DOC_F1) as Record<string, unknown>;
    const result = publishNutritionRevision(
      state,
      baseRequest({ payload: { document: submitted } }),
    );
    expect(result.status).toBe('ok');
    const committedBefore = JSON.stringify(state.contents[0]!.document);
    // the caller edits the submitted draft after publication
    (submitted.meals as Array<Record<string, unknown>>)[0]!.note =
      'tampered after publish';
    expect(JSON.stringify(state.contents[0]!.document)).toBe(committedBefore);
    expect(JSON.stringify(state.contents[0]!.document)).not.toContain(
      'tampered after publish',
    );
  });

  it('returns the original receipt for an identical key/request without new writes', () => {
    const state = freshState();
    const first = publishNutritionRevision(state, baseRequest());
    expect(first.status).toBe('ok');
    const before = {
      contents: state.contents.length,
      deliveries: state.deliveries.length,
      audit: state.auditEvents.length,
      revision: state.currentRevision,
    };
    const replay = publishNutritionRevision(state, baseRequest());
    expect(replay).toEqual(first);
    expect({
      contents: state.contents.length,
      deliveries: state.deliveries.length,
      audit: state.auditEvents.length,
      revision: state.currentRevision,
    }).toEqual(before);
  });

  it('appends a new revision and delivery for a new authorized key even with unchanged content', () => {
    const state = freshState();
    const first = publishNutritionRevision(state, baseRequest());
    expect(first.status).toBe('ok');
    const second = publishNutritionRevision(
      state,
      baseRequest({
        operationKey: '0f3a1b2c-2222-4222-8333-444455556666',
        canonicalRequest: 'hash-2',
        expectedRevision: 2,
      }),
    );
    expect(second.status).toBe('ok');
    if (second.status === 'ok' && first.status === 'ok') {
      expect(second.receipt.revisionId).toBe(first.receipt.revisionId + 1);
      expect(second.receipt.deliveryId).toBe(second.receipt.revisionId);
    }
    expect(state.contents).toHaveLength(2);
    expect(state.deliveries).toHaveLength(2);
    expect(state.auditEvents).toHaveLength(2);
  });

  it('aborts the whole publish when a referenced food version is missing', () => {
    const state = freshState();
    const forgedDoc = structuredClone(DOC_F1) as Record<string, unknown>;
    const meals = forgedDoc.meals as Array<Record<string, unknown>>;
    meals[0]!.items = [
      {
        id: 'i-1',
        foodId: 'missing-food',
        foodVersion: 9,
        quantity: { value: '37', unit: { kind: 'basis', value: 'g' } },
        note: null,
        alternatives: [],
      },
    ];
    const result = publishNutritionRevision(
      state,
      baseRequest({ payload: { document: forgedDoc } }),
    );
    expect(result.status).toBe('missing_food_version');
    expect(state.contents).toHaveLength(0);
    expect(state.currentRevision).toBe(1);
    expect(state.deliveries).toHaveLength(0);
    expect(state.auditEvents).toHaveLength(0);
  });

  it('rejects the same key with a different canonical request as key_conflict', () => {
    const state = freshState();
    expect(publishNutritionRevision(state, baseRequest()).status).toBe('ok');
    const conflict = publishNutritionRevision(
      state,
      baseRequest({ canonicalRequest: 'hash-different' }),
    );
    expect(conflict.status).toBe('key_conflict');
    expect(state.contents).toHaveLength(1);
  });

  it('returns an exact replay receipt even when the subscription has since expired', () => {
    const state = freshState();
    const first = publishNutritionRevision(state, baseRequest());
    expect(first.status).toBe('ok');
    const replay = publishNutritionRevision(
      state,
      baseRequest({ subscriptionActive: false }),
    );
    expect(replay).toEqual(first);
    expect(state.contents).toHaveLength(1);
  });

  it('refuses a new key without a current subscription before any nutrition work', () => {
    const state = freshState();
    const result = publishNutritionRevision(
      state,
      baseRequest({ subscriptionActive: false }),
    );
    expect(result.status).toBe('refused_no_subscription');
    expect(state.contents).toHaveLength(0);
    expect(state.deliveries).toHaveLength(0);
  });

  it('refuses a stale expected revision with no partial write', () => {
    const state = freshState();
    const result = publishNutritionRevision(
      state,
      baseRequest({ expectedRevision: 99 }),
    );
    expect(result.status).toBe('stale_version');
    expect(state.contents).toHaveLength(0);
  });

  it('denies unauthorized actors before any read or write', () => {
    const state = freshState();
    expect(
      publishNutritionRevision(
        state,
        baseRequest({ actor: { role: 'sales', workspaceId: PLAN_WORKSPACE } }),
      ).status,
    ).toBe('not_permitted');
    expect(
      publishNutritionRevision(
        state,
        baseRequest({ actor: { role: 'trainer', workspaceId: 'ws-other' } }),
      ).status,
    ).toBe('not_permitted');
    expect(state.contents).toHaveLength(0);
    expect(state.auditEvents).toHaveLength(0);
  });

  it('rejects a document that fails the frozen validator with no revision', () => {
    const state = freshState();
    const badDoc = structuredClone(DOC_F1) as Record<string, unknown>;
    badDoc.implicitDayTypeId = undefined;
    const result = publishNutritionRevision(
      state,
      baseRequest({ payload: { document: badDoc } }),
    );
    expect(result.status).not.toBe('ok');
    expect(state.contents).toHaveLength(0);
  });

  it('writes exactly one audit event per committed publish', () => {
    const state = freshState();
    publishNutritionRevision(state, baseRequest());
    publishNutritionRevision(
      state,
      baseRequest({
        operationKey: '0f3a1b2c-3333-4222-8333-444455556666',
        canonicalRequest: 'hash-3',
        expectedRevision: 2,
      }),
    );
    expect(state.auditEvents).toHaveLength(2);
    for (const event of state.auditEvents) {
      expect(event.action).toBe('plan.nutrition_publish');
    }
  });
});
