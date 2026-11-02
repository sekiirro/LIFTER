import { describe, expect, it } from 'vitest';
import {
  F17_WORKOUT_MUTATION_ACTIONS,
  OperationKeyLedger,
  operationRequestHash,
} from '../../lib/plans/workout/operation-keys';

const actor = '7f9e8f76-3d6a-4b8b-9f2c-0f6f7c11a001';
const key = '7f9e8f76-3d6a-4b8b-9f2c-0f6f7c11a002';
const action = 'workout_plan.save_draft' as const;

// Cross-checks use F16's PostgreSQL jsonb::text bytes (sorted object keys,
// comma/colon spaces), then SHA-256 UTF-8, prefixed with "sha256:".
const vectors = [
  {
    action,
    payload: null,
    expected:
      'sha256:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
  },
  {
    action,
    payload: { b: 2, a: 1 },
    expected:
      'sha256:d8497d9d82770a70729261095aa98f7ef5154d7af499f8037b6ca250296785a6',
  },
  {
    action,
    payload: { plan_id: 'abc', expected_revision: 7 },
    expected:
      'sha256:52bda49894b72761784cc262a45209ebcaaa6583321a5c3708120e579f0ca857',
  },
] as const;

describe('workout operation key contracts', () => {
  it('freezes only the six F17 plan and template mutation actions', () => {
    expect(F17_WORKOUT_MUTATION_ACTIONS).toEqual([
      'workout_plan.save_draft',
      'workout_plan.publish',
      'workout_template.create',
      'workout_template.version',
      'workout_template.retire',
      'workout_template.load_into_draft',
    ]);
  });

  it('matches fixed F16 request hash vectors', () => {
    for (const vector of vectors) {
      expect(operationRequestHash(vector.action, vector.payload)).toBe(
        vector.expected,
      );
    }
  });

  it('is stable under object key reordering and changes with payload', () => {
    expect(operationRequestHash(action, { b: 2, a: 1 })).toBe(
      operationRequestHash(action, { a: 1, b: 2 }),
    );
    expect(operationRequestHash(action, { a: 2 })).not.toBe(
      operationRequestHash(action, { a: 1 }),
    );
  });

  it('replays the saved result for the same actor, key, action, and hash', () => {
    const ledger = new OperationKeyLedger();
    const hash = operationRequestHash(action, { revision: 3 });
    ledger.claim(actor, action, key, hash, new Date('2026-11-02T12:00:00Z'));
    const result = { plan_id: 'p1', revision: 4 };
    ledger.saveResultOnce(actor, key, result);
    expect(ledger.lookup(actor, action, key, hash)).toEqual({
      status: 'saved',
      result,
    });
  });

  it('conflicts when the same key is reused with another request hash or action', () => {
    const ledger = new OperationKeyLedger();
    const hash = operationRequestHash(action, { revision: 3 });
    ledger.claim(actor, action, key, hash);
    expect(
      ledger.lookup(
        actor,
        action,
        key,
        operationRequestHash(action, { revision: 4 }),
      ),
    ).toEqual({ status: 'conflict' });
    expect(ledger.lookup(actor, 'workout_plan.publish', key, hash)).toEqual({
      status: 'conflict',
    });
  });

  it('reports in_progress until the claimed row has a result', () => {
    const ledger = new OperationKeyLedger();
    const hash = operationRequestHash(action, { revision: 3 });
    ledger.claim(actor, action, key, hash);
    expect(ledger.lookup(actor, action, key, hash)).toEqual({
      status: 'in_progress',
    });
  });

  it('allows a result to be saved once only', () => {
    const ledger = new OperationKeyLedger();
    ledger.claim(actor, action, key, operationRequestHash(action, {}));
    ledger.saveResultOnce(actor, key, { ok: true });
    expect(() => ledger.saveResultOnce(actor, key, { ok: false })).toThrow(
      'result_already_saved',
    );
  });

  it('purges rows older than 30 days and retains newer rows', () => {
    const ledger = new OperationKeyLedger();
    const hash = operationRequestHash(action, {});
    const now = new Date('2026-11-02T12:00:00Z');
    ledger.claim(actor, action, key, hash, new Date('2026-10-03T11:59:59Z'));
    ledger.claim(
      actor,
      action,
      '7f9e8f76-3d6a-4b8b-9f2c-0f6f7c11a003',
      hash,
      new Date('2026-10-03T12:00:01Z'),
    );
    expect(ledger.purgeOlderThan30Days(now)).toBe(1);
    expect(ledger.lookup(actor, action, key, hash)).toEqual({ status: 'null' });
    expect(
      ledger.lookup(
        actor,
        action,
        '7f9e8f76-3d6a-4b8b-9f2c-0f6f7c11a003',
        hash,
      ),
    ).toEqual({ status: 'in_progress' });
  });

  it('rejects invalid and non-v4 operation keys and malformed actions', () => {
    const ledger = new OperationKeyLedger();
    const hash = operationRequestHash(action, {});
    expect(() => ledger.claim(actor, action, 'not-a-uuid', hash)).toThrow(
      'operation_key_request_invalid',
    );
    expect(() =>
      ledger.claim(actor, action, '7f9e8f76-3d6a-1b8b-9f2c-0f6f7c11a002', hash),
    ).toThrow('operation_key_request_invalid');
    expect(() => ledger.claim(actor, 'Workout.save', key, hash)).toThrow(
      'operation_key_request_invalid',
    );
    expect(() => operationRequestHash('bad action', {})).toThrow(
      'operation_key_request_invalid',
    );
  });
});
