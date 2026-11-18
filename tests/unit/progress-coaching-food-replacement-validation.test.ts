import { describe, expect, it } from 'vitest';
import {
  MAX_ALTERNATIVES_PER_ITEM,
  REQUEST_TEXT_MAX_BYTES,
  REQUEST_TEXT_MAX_CODE_POINTS,
  mapOperationResult,
  parseApproveInput,
  parseRequestIdInput,
  parseRequestRow,
  parseRequestText,
  parseSelectInput,
  parseSubmitInput,
} from '../../lib/progress-coaching/food-replacement/validation';
import { httpStatusFor } from '../../lib/progress-coaching/food-replacement/http';

const PLAN_VERSION = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const ALT = '33333333-3333-4333-8333-333333333333';
const KEY = '44444444-4444-4444-8444-444444444444';
const REQUEST = '55555555-5555-4555-8555-555555555555';
const FOOD = '66666666-6666-4666-8666-666666666666';

describe('request text limits (FR-021, SC-008)', () => {
  it('uses the F15 long-text limit and the 4,096 byte cap', () => {
    expect(REQUEST_TEXT_MAX_CODE_POINTS).toBe(1000);
    expect(REQUEST_TEXT_MAX_BYTES).toBe(4096);
  });

  it('trims and accepts text up to 1,000 code points', () => {
    expect(parseRequestText('  أريد بديلا للأرز  ')).toBe('أريد بديلا للأرز');
    expect(parseRequestText('a'.repeat(1000))).toHaveLength(1000);
  });

  it('rejects empty, whitespace-only and over-long text', () => {
    expect(parseRequestText('')).toBeNull();
    expect(parseRequestText(' \n\t ')).toBeNull();
    expect(parseRequestText('a'.repeat(1001))).toBeNull();
  });

  it('counts code points, not UTF-16 units', () => {
    // 1,000 astral code points are 2,000 UTF-16 units and 4,000 bytes: allowed.
    expect(parseRequestText('😀'.repeat(1000))).not.toBeNull();
    expect(parseRequestText('😀'.repeat(1001))).toBeNull();
  });

  it('keeps the largest accepted text inside the 4,096 byte cap', () => {
    // UTF-8 needs at most 4 bytes per code point, so 1,000 code points are at
    // most 4,000 bytes; the byte check in the parser is a defensive backstop.
    const widest = parseRequestText('😀'.repeat(1000));
    expect(new TextEncoder().encode(widest ?? '').length).toBe(4000);
    expect(4000).toBeLessThanOrEqual(REQUEST_TEXT_MAX_BYTES);
  });

  it('rejects NUL and non-strings', () => {
    expect(parseRequestText('a\u0000b')).toBeNull();
    for (const bad of [null, undefined, 5, {}, ['a']])
      expect(parseRequestText(bad)).toBeNull();
  });
});

describe('submit / cancel input (one open per food, cancel without edit)', () => {
  const valid = {
    planVersionId: PLAN_VERSION,
    itemId: ITEM,
    requestText: ' Replace the rice ',
  };

  it('parses a valid submission and trims the text', () => {
    expect(parseSubmitInput(valid)).toEqual({
      planVersionId: PLAN_VERSION,
      itemId: ITEM,
      requestText: 'Replace the rice',
    });
  });

  it('never accepts workspace, client or status fields from the body', () => {
    for (const extra of [
      { workspaceId: PLAN_VERSION },
      { clientId: PLAN_VERSION },
      { status: 'approved' },
      { attachment: 'x' },
    ])
      expect(parseSubmitInput({ ...valid, ...extra })).toBeNull();
  });

  it('rejects malformed ids and missing text', () => {
    expect(parseSubmitInput({ ...valid, itemId: 'nope' })).toBeNull();
    expect(parseSubmitInput({ ...valid, planVersionId: 5 })).toBeNull();
    expect(parseSubmitInput({ ...valid, requestText: '' })).toBeNull();
    expect(parseSubmitInput(null)).toBeNull();
    expect(parseSubmitInput([valid])).toBeNull();
  });

  it('maps a cancel after approval to already_prepared (B1)', () => {
    expect(
      mapOperationResult('cancel', {
        data: { status: 'already_prepared' },
        error: null,
      }),
    ).toEqual({ status: 'already_prepared' });
  });

  it('cancel and reject take only a request id, so a request text cannot be edited (FR-020)', () => {
    expect(parseRequestIdInput({ requestId: REQUEST })).toEqual({
      requestId: REQUEST,
    });
    expect(
      parseRequestIdInput({ requestId: REQUEST, requestText: 'edited' }),
    ).toBeNull();
    expect(parseRequestIdInput({ requestId: 'x' })).toBeNull();
  });

  it('reports an already open request distinctly from a fresh one', () => {
    expect(
      mapOperationResult('submit', {
        data: { status: 'already_open', request_id: REQUEST },
        error: null,
      }),
    ).toEqual({ status: 'already_open', requestId: REQUEST });
    expect(
      mapOperationResult('submit', {
        data: { status: 'created', request_id: REQUEST },
        error: null,
      }),
    ).toEqual({ status: 'created', requestId: REQUEST });
  });
});

describe('select input (FR-018)', () => {
  const valid = {
    planVersionId: PLAN_VERSION,
    itemId: ITEM,
    alternativeId: ALT,
    operationKey: KEY,
  };

  it('accepts an alternative or a null clear', () => {
    expect(parseSelectInput(valid)).toEqual(valid);
    expect(parseSelectInput({ ...valid, alternativeId: null })).toEqual({
      ...valid,
      alternativeId: null,
    });
  });

  it('requires canonical v4 ids and rejects extra keys', () => {
    expect(parseSelectInput({ ...valid, operationKey: 'k' })).toBeNull();
    expect(parseSelectInput({ ...valid, alternativeId: undefined })).toBeNull();
    expect(parseSelectInput({ ...valid, clientId: KEY })).toBeNull();
    expect(
      parseSelectInput({
        ...valid,
        operationKey: '44444444-4444-1444-8444-444444444444',
      }),
    ).toBeNull();
  });
});

describe('approval input (FR-022, FR-023)', () => {
  const valid = {
    requestId: REQUEST,
    foodId: FOOD,
    foodVersion: 2,
    quantity: { value: '150', unit: { kind: 'basis', value: 'g' } },
    replaceAlternativeId: null,
    expectedDraftVersion: 3,
    operationKey: KEY,
  };

  it('keeps the cap constant at three', () => {
    expect(MAX_ALTERNATIVES_PER_ITEM).toBe(3);
  });

  it('parses basis and serving quantities', () => {
    expect(parseApproveInput(valid)).toEqual(valid);
    expect(
      parseApproveInput({
        ...valid,
        replaceAlternativeId: ALT,
        quantity: { value: '1.5', unit: { kind: 'serving', unitKey: 'cup' } },
      }),
    ).toMatchObject({ replaceAlternativeId: ALT });
  });

  it('rejects non-positive, malformed and unknown quantity shapes', () => {
    for (const quantity of [
      { value: '0', unit: { kind: 'basis', value: 'g' } },
      { value: '-1', unit: { kind: 'basis', value: 'g' } },
      { value: '1.2345', unit: { kind: 'basis', value: 'g' } },
      { value: 100, unit: { kind: 'basis', value: 'g' } },
      { value: '100', unit: { kind: 'basis', value: 'kg' } },
      { value: '100', unit: { kind: 'serving', unitKey: 'a b' } },
      { value: '100', unit: { kind: 'basis', value: 'g', extra: 1 } },
      { value: '100' },
    ])
      expect(parseApproveInput({ ...valid, quantity })).toBeNull();
  });

  it('rejects unsafe versions, ids and extra keys', () => {
    expect(parseApproveInput({ ...valid, foodVersion: 0 })).toBeNull();
    expect(parseApproveInput({ ...valid, foodVersion: 1.5 })).toBeNull();
    expect(parseApproveInput({ ...valid, expectedDraftVersion: 0 })).toBeNull();
    expect(parseApproveInput({ ...valid, requestId: 'x' })).toBeNull();
    expect(parseApproveInput({ ...valid, publish: true })).toBeNull();
  });

  it('has no publish switch: approval input cannot request auto-publish', () => {
    expect(Object.keys(parseApproveInput(valid) ?? {})).not.toContain(
      'publish',
    );
  });
});

describe('operation result mapping', () => {
  it('maps the database wall (42501) to denied for every operation', () => {
    for (const op of ['submit', 'cancel', 'reject', 'approve'] as const)
      expect(
        mapOperationResult(op, { data: null, error: { code: '42501' } }),
      ).toEqual({ status: 'denied' });
  });

  it('maps F19 draft errors raised during approval', () => {
    expect(
      mapOperationResult('approve', {
        data: null,
        error: { code: '40001', message: 'stale_version' },
      }),
    ).toEqual({ status: 'stale_version' });
    expect(
      mapOperationResult('approve', {
        data: null,
        error: { code: '23505', message: 'key_conflict' },
      }),
    ).toEqual({ status: 'key_conflict' });
  });

  it('turns unknown errors and unexpected statuses into unavailable', () => {
    expect(
      mapOperationResult('submit', {
        data: null,
        error: { code: 'XX000', message: 'boom with health text' },
      }),
    ).toEqual({ status: 'unavailable' });
    expect(
      mapOperationResult('cancel', {
        data: { status: 'created' },
        error: null,
      }),
    ).toEqual({ status: 'unavailable' });
    expect(mapOperationResult('reject', { data: 5, error: null })).toEqual({
      status: 'unavailable',
    });
  });

  it('returns the prepared draft version without any publish outcome', () => {
    expect(
      mapOperationResult('approve', {
        data: { status: 'prepared', draft_version: 4, alternative_id: ALT },
        error: null,
      }),
    ).toEqual({ status: 'prepared', draftVersion: 4, alternativeId: ALT });
    expect(
      mapOperationResult('approve', {
        data: { status: 'published' },
        error: null,
      }),
    ).toEqual({ status: 'unavailable' });
  });

  it('maps outcomes to a closed HTTP status set', () => {
    expect(httpStatusFor({ status: 'created' })).toBe(201);
    expect(httpStatusFor({ status: 'prepared' })).toBe(200);
    expect(httpStatusFor({ status: 'invalid' })).toBe(400);
    expect(httpStatusFor({ status: 'denied' })).toBe(404);
    expect(httpStatusFor({ status: 'cap_reached' })).toBe(409);
    expect(httpStatusFor({ status: 'invalid_alternative' })).toBe(422);
    expect(httpStatusFor({ status: 'unavailable' })).toBe(503);
  });
});

describe('request row parsing', () => {
  const row = {
    id: REQUEST,
    client_id: KEY,
    plan_id: ALT,
    plan_version_id: PLAN_VERSION,
    item_id: ITEM,
    request_text: 'x',
    status: 'open',
    prepared_alternative_id: null,
    created_at: '2026-11-17T10:00:00Z',
    resolved_at: null,
  };

  it('parses an open row and reports no prepared draft', () => {
    expect(parseRequestRow(row)).toMatchObject({
      status: 'open',
      draftPrepared: false,
    });
  });

  it('flags a prepared draft and rejects unknown statuses', () => {
    expect(
      parseRequestRow({ ...row, prepared_alternative_id: ALT }),
    ).toMatchObject({ draftPrepared: true });
    expect(parseRequestRow({ ...row, status: 'published' })).toBeNull();
    expect(parseRequestRow({ ...row, resolved_at: 5 })).toBeNull();
    expect(parseRequestRow(null)).toBeNull();
  });
});
