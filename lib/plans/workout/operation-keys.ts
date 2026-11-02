import { createHash } from 'node:crypto';

export const F17_WORKOUT_MUTATION_ACTIONS = Object.freeze([
  'workout_plan.save_draft',
  'workout_plan.publish',
  'workout_template.create',
  'workout_template.version',
  'workout_template.retire',
  'workout_template.load_into_draft',
] as const);

export type F17WorkoutMutationAction =
  (typeof F17_WORKOUT_MUTATION_ACTIONS)[number];
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type OperationLookup =
  | { status: 'null' }
  | { status: 'saved'; result: JsonValue }
  | { status: 'conflict' }
  | { status: 'in_progress' };

const ACTION_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANY_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type OperationKeyRow = {
  actorUserId: string;
  action: string;
  operationKey: string;
  requestHash: string;
  result: JsonValue | null;
  createdAt: Date;
};

function invalidRequest(): never {
  throw new Error('operation_key_request_invalid');
}

function validateAction(action: string): void {
  if (!ACTION_PATTERN.test(action)) invalidRequest();
}

function validateOperationKey(operationKey: string): void {
  if (!UUID_PATTERN.test(operationKey)) invalidRequest();
}

function validateActor(actorUserId: string): void {
  if (!ANY_UUID_PATTERN.test(actorUserId)) invalidRequest();
}

function validateRequestHash(requestHash: string): void {
  if (!REQUEST_HASH_PATTERN.test(requestHash)) invalidRequest();
}

function compareUtf8(left: string, right: string): number {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return a.length - b.length;
  return Buffer.compare(a, b);
}

function pgNumberText(value: number): string {
  if (!Number.isFinite(value)) invalidRequest();
  if (Object.is(value, -0)) return '0';
  const source = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(source);
  if (!match) invalidRequest();
  const [, sign = '', integer = '', fraction = '', exponentText] = match;
  const exponent = Number(exponentText ?? 0);
  const digits = `${integer}${fraction}`;
  const point = integer.length + exponent;
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length)
    return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** Serialize JSON values using PostgreSQL jsonb::text spacing and object-key ordering. */
function canonicalJsonbText(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return pgNumberText(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(canonicalJsonbText).join(', ')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) =>
      compareUtf8(left, right),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}: ${canonicalJsonbText(item)}`).join(', ')}}`;
  }
  return invalidRequest();
}

/**
 * Match F16's request hash: SHA-256 of PostgreSQL jsonb::text UTF-8 bytes,
 * prefixed with sha256:. F16 binds action in its separate ledger column, so
 * action is validated here but deliberately is not part of the hashed bytes.
 */
export function operationRequestHash(
  action: string,
  payload: JsonValue,
): string {
  validateAction(action);
  const digest = createHash('sha256')
    .update(canonicalJsonbText(payload), 'utf8')
    .digest('hex');
  return `sha256:${digest}`;
}

/**
 * Executable in-memory reference for F16's operation_keys contract. Production
 * adapters must use the shared app_private.operation_keys database ledger;
 * this model is only a test contract and is never authoritative.
 */
export class OperationKeyLedger {
  private readonly rows = new Map<string, OperationKeyRow>();

  private rowId(actorUserId: string, operationKey: string): string {
    return `${actorUserId.toLowerCase()}:${operationKey.toLowerCase()}`;
  }

  lookup(
    actorUserId: string,
    action: string,
    operationKey: string,
    requestHash: string,
  ): OperationLookup {
    validateActor(actorUserId);
    validateAction(action);
    validateOperationKey(operationKey);
    validateRequestHash(requestHash);
    const row = this.rows.get(this.rowId(actorUserId, operationKey));
    if (!row) return { status: 'null' };
    if (row.action !== action || row.requestHash !== requestHash)
      return { status: 'conflict' };
    if (row.result === null) return { status: 'in_progress' };
    return { status: 'saved', result: structuredClone(row.result) };
  }

  claim(
    actorUserId: string,
    action: string,
    operationKey: string,
    requestHash: string,
    createdAt = new Date(),
  ): OperationLookup {
    const existing = this.lookup(
      actorUserId,
      action,
      operationKey,
      requestHash,
    );
    if (existing.status !== 'null') return existing;
    if (!Number.isFinite(createdAt.getTime())) invalidRequest();
    this.rows.set(this.rowId(actorUserId, operationKey), {
      actorUserId,
      action,
      operationKey,
      requestHash,
      result: null,
      createdAt: new Date(createdAt),
    });
    return { status: 'in_progress' };
  }

  saveResultOnce(
    actorUserId: string,
    operationKey: string,
    result: JsonValue,
  ): void {
    validateActor(actorUserId);
    validateOperationKey(operationKey);
    const row = this.rows.get(this.rowId(actorUserId, operationKey));
    if (!row) throw new Error('operation_key_not_claimed');
    if (row.result !== null) throw new Error('result_already_saved');
    if (result === null) invalidRequest();
    row.result = structuredClone(result);
  }

  purgeOlderThan30Days(now = new Date()): number {
    if (!Number.isFinite(now.getTime())) invalidRequest();
    const cutoff = now.getTime() - RETENTION_MS;
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.createdAt.getTime() < cutoff) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}
