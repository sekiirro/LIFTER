/**
 * Pure input parsing for the food replacement workflow (spec 023 US3).
 * Everything here parses untrusted request bodies; the database operations
 * remain the authority and re-validate every value.
 */

/** FR-021: F15 long-text limit (code points) and the per-answer byte cap. */
export const REQUEST_TEXT_MAX_CODE_POINTS = 1000;
export const REQUEST_TEXT_MAX_BYTES = 4096;
/** FR-006 (F18): at most three alternatives per item. */
export const MAX_ALTERNATIVES_PER_ITEM = 3;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const QUANTITY_VALUE = /^[0-9]+(\.[0-9]{1,3})?$/;
const UNIT_KEY = /^[A-Za-z0-9_.-]{1,64}$/;

// JS whitespace plus NEL (U+0085), matching the client-note normalizer.
const LEADING_TRAILING_WHITESPACE = /^[\s\u0085]+|[\s\u0085]+$/gu;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Canonical lower-case UUID v4, the shape F18 uses for document, plan-version and operation ids. */
export const isUuidV4 = (value: unknown): value is string =>
  typeof value === 'string' && UUID_V4.test(value);

/** Rejects unknown keys so a body cannot smuggle workspace, client or status fields. */
function hasOnly(input: UnknownRecord, keys: readonly string[]): boolean {
  return Object.keys(input).every((key) => keys.includes(key));
}

/**
 * Trims and validates a request text: non-empty, at most 1,000 code points and
 * 4,096 UTF-8 bytes (FR-021). Attachments do not exist; only text is accepted.
 */
export function parseRequestText(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.includes('\u0000')) return null;
  const text = raw.replace(LEADING_TRAILING_WHITESPACE, '');
  const codePoints = Array.from(text).length;
  if (codePoints < 1 || codePoints > REQUEST_TEXT_MAX_CODE_POINTS) return null;
  if (new TextEncoder().encode(text).length > REQUEST_TEXT_MAX_BYTES)
    return null;
  return text;
}

export type SelectInput = {
  planVersionId: string;
  itemId: string;
  /** Null clears the selection (the coach default applies). */
  alternativeId: string | null;
  operationKey: string;
};

export function parseSelectInput(input: unknown): SelectInput | null {
  if (
    !isRecord(input) ||
    !hasOnly(input, [
      'planVersionId',
      'itemId',
      'alternativeId',
      'operationKey',
    ])
  )
    return null;
  const { planVersionId, itemId, alternativeId, operationKey } = input;
  const alternativeOk = alternativeId === null || isUuidV4(alternativeId);
  if (
    !isUuidV4(planVersionId) ||
    !isUuidV4(itemId) ||
    !alternativeOk ||
    !isUuidV4(operationKey)
  )
    return null;
  return {
    planVersionId,
    itemId,
    alternativeId: alternativeId as string | null,
    operationKey,
  };
}

export type SubmitInput = {
  planVersionId: string;
  itemId: string;
  requestText: string;
};

export function parseSubmitInput(input: unknown): SubmitInput | null {
  if (
    !isRecord(input) ||
    !hasOnly(input, ['planVersionId', 'itemId', 'requestText'])
  )
    return null;
  const requestText = parseRequestText(input.requestText);
  if (
    !isUuidV4(input.planVersionId) ||
    !isUuidV4(input.itemId) ||
    requestText === null
  )
    return null;
  return {
    planVersionId: input.planVersionId,
    itemId: input.itemId,
    requestText,
  };
}

export type RequestIdInput = { requestId: string };

/** Cancel and reject take only a request id; there is no text edit (FR-020). */
export function parseRequestIdInput(input: unknown): RequestIdInput | null {
  if (!isRecord(input) || !hasOnly(input, ['requestId'])) return null;
  return isUuidV4(input.requestId) ? { requestId: input.requestId } : null;
}

export type AlternativeQuantity = {
  value: string;
  unit:
    { kind: 'basis'; value: 'g' | 'ml' } | { kind: 'serving'; unitKey: string };
};

function parseQuantity(input: unknown): AlternativeQuantity | null {
  if (!isRecord(input) || !hasOnly(input, ['value', 'unit'])) return null;
  const { value, unit } = input;
  if (
    typeof value !== 'string' ||
    !QUANTITY_VALUE.test(value) ||
    !/[1-9]/.test(value) ||
    !isRecord(unit)
  )
    return null;
  if (
    unit.kind === 'basis' &&
    hasOnly(unit, ['kind', 'value']) &&
    (unit.value === 'g' || unit.value === 'ml')
  )
    return { value, unit: { kind: 'basis', value: unit.value } };
  if (
    unit.kind === 'serving' &&
    hasOnly(unit, ['kind', 'unitKey']) &&
    typeof unit.unitKey === 'string' &&
    UNIT_KEY.test(unit.unitKey)
  )
    return { value, unit: { kind: 'serving', unitKey: unit.unitKey } };
  return null;
}

export type ApproveInput = {
  requestId: string;
  foodId: string;
  foodVersion: number;
  quantity: AlternativeQuantity;
  /** Required when the item already carries three alternatives (FR-023). */
  replaceAlternativeId: string | null;
  expectedDraftVersion: number;
  operationKey: string;
};

export function parseApproveInput(input: unknown): ApproveInput | null {
  if (
    !isRecord(input) ||
    !hasOnly(input, [
      'requestId',
      'foodId',
      'foodVersion',
      'quantity',
      'replaceAlternativeId',
      'expectedDraftVersion',
      'operationKey',
    ])
  )
    return null;
  const quantity = parseQuantity(input.quantity);
  const { foodVersion, expectedDraftVersion } = input;
  const replace = input.replaceAlternativeId ?? null;
  if (
    !isUuidV4(input.requestId) ||
    !isUuidV4(input.foodId) ||
    !quantity ||
    typeof foodVersion !== 'number' ||
    !Number.isSafeInteger(foodVersion) ||
    foodVersion < 1 ||
    foodVersion > 2_147_483_647 ||
    (replace !== null && !isUuidV4(replace)) ||
    typeof expectedDraftVersion !== 'number' ||
    !Number.isSafeInteger(expectedDraftVersion) ||
    expectedDraftVersion < 1 ||
    !isUuidV4(input.operationKey)
  )
    return null;
  return {
    requestId: input.requestId,
    foodId: input.foodId,
    foodVersion,
    quantity,
    replaceAlternativeId: replace,
    expectedDraftVersion,
    operationKey: input.operationKey,
  };
}

/** Request states (FR-027) plus the client withdrawal allowed by FR-020. */
export const REQUEST_STATUSES = [
  'open',
  'rejected',
  'approved',
  'stale_closed',
  'cancelled',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type FoodReplacementRequest = {
  id: string;
  clientId: string;
  planId: string;
  planVersionId: string;
  itemId: string;
  requestText: string;
  status: RequestStatus;
  /** True once an F19 draft carries the approved alternative; it still needs a manual publish. */
  draftPrepared: boolean;
  createdAt: string;
  resolvedAt: string | null;
};

export function parseRequestRow(row: unknown): FoodReplacementRequest | null {
  if (!isRecord(row)) return null;
  const status = row.status;
  if (
    typeof row.id !== 'string' ||
    typeof row.client_id !== 'string' ||
    typeof row.plan_id !== 'string' ||
    typeof row.plan_version_id !== 'string' ||
    typeof row.item_id !== 'string' ||
    typeof row.request_text !== 'string' ||
    typeof status !== 'string' ||
    !(REQUEST_STATUSES as readonly string[]).includes(status) ||
    typeof row.created_at !== 'string' ||
    !(row.resolved_at === null || typeof row.resolved_at === 'string')
  )
    return null;
  return {
    id: row.id,
    clientId: row.client_id,
    planId: row.plan_id,
    planVersionId: row.plan_version_id,
    itemId: row.item_id,
    requestText: row.request_text,
    status: status as RequestStatus,
    draftPrepared: typeof row.prepared_alternative_id === 'string',
    createdAt: row.created_at,
    resolvedAt: row.resolved_at as string | null,
  };
}

/** Outcome codes returned to callers; never raw database text. */
export type FoodReplacementStatus =
  | 'ok'
  | 'created'
  | 'already_open'
  | 'cancelled'
  | 'rejected'
  | 'prepared'
  | 'selected'
  | 'not_open'
  | 'already_prepared'
  | 'stale_version'
  | 'target_missing'
  | 'cap_reached'
  | 'invalid_replace'
  | 'invalid_alternative'
  | 'key_conflict'
  | 'invalid_selection'
  | 'invalid'
  | 'denied'
  | 'unavailable';

export type FoodReplacementResult = {
  status: FoodReplacementStatus;
  requestId?: string;
  draftVersion?: number;
  alternativeId?: string;
};

const ALLOWED: Record<string, readonly FoodReplacementStatus[]> = {
  submit: ['created', 'already_open', 'stale_version', 'invalid'],
  cancel: ['cancelled', 'not_open'],
  reject: ['rejected', 'not_open'],
  approve: [
    'prepared',
    'not_open',
    'already_prepared',
    'stale_version',
    'target_missing',
    'cap_reached',
    'invalid_replace',
    'invalid_alternative',
    'invalid',
    'unavailable',
  ],
};

export type FoodReplacementOperation = keyof typeof ALLOWED;

type RpcResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

/**
 * Maps an RPC result to the closed outcome set. SQLSTATE 42501 is the database
 * wall (foreign workspace, wrong role, not the owning client); anything not in
 * the operation's allow-list becomes `unavailable`.
 */
export function mapOperationResult(
  operation: FoodReplacementOperation,
  result: RpcResult,
): FoodReplacementResult {
  if (result.error) {
    const { code, message } = result.error;
    if (code === '42501') return { status: 'denied' };
    if (code === '40001' && message === 'stale_version')
      return { status: 'stale_version' };
    if (code === '23505' && message === 'key_conflict')
      return { status: 'key_conflict' };
    return { status: 'unavailable' };
  }
  const data = isRecord(result.data) ? result.data : {};
  const status = data.status;
  if (
    typeof status !== 'string' ||
    !(ALLOWED[operation] as readonly string[]).includes(status)
  )
    return { status: 'unavailable' };
  const out: FoodReplacementResult = {
    status: status as FoodReplacementStatus,
  };
  if (typeof data.request_id === 'string') out.requestId = data.request_id;
  if (typeof data.draft_version === 'number')
    out.draftVersion = data.draft_version;
  if (typeof data.alternative_id === 'string')
    out.alternativeId = data.alternative_id;
  return out;
}
