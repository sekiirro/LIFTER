import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import type { Actor } from '../../lib/auth/authorize';
import {
  canReadDirectory,
  directoryHref,
  directoryRpcArgs,
  parseDirectoryQuery,
  parseDirectoryResult,
} from '../../lib/client-directory/query';
import { loadClientDirectory } from '../../lib/client-directory/service';

// Synthetic identifiers only.
const wsA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const wsB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const clientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const actor = (role: Actor['role'], workspaces: string[] = [wsA]): Actor => ({
  userId: '99999999-9999-4999-8999-999999999999',
  role,
  activeWorkspaceIds: workspaces,
});
const row = {
  client_id: clientId,
  name: 'Synthetic client',
  approval_state: 'approved',
  subscription_status: 'active',
  plans_waiting_for_delivery: 2,
};

describe('F22 directory query parsing (T030; FR-011)', () => {
  it('accepts the approved search and the existing filter dimensions', () => {
    expect(
      parseDirectoryQuery({
        q: '  synthetic@example.test ',
        approval: 'pending-approval',
        subscription: 'frozen',
        page: '3',
      }),
    ).toEqual({
      search: 'synthetic@example.test',
      approvalState: 'pending-approval',
      subscriptionStatus: 'frozen',
      page: 3,
    });
    expect(parseDirectoryQuery({})).toEqual({
      search: null,
      approvalState: null,
      subscriptionStatus: null,
      page: 1,
    });
    expect(
      parseDirectoryQuery({ q: '   ', approval: '', subscription: '' }),
    ).toMatchObject({
      search: null,
      approvalState: null,
      subscriptionStatus: null,
    });
  });

  it('rejects values outside the existing F11/F13 states (no new statuses)', () => {
    for (const params of [
      { approval: 'deleted' },
      { approval: 'Approved' },
      { subscription: 'overdue' },
      { subscription: 'unassigned' },
      { page: '0' },
      { page: '201' },
      { page: '1e3' },
      { q: ['a', 'b'] },
      { q: 'x'.repeat(101) },
    ])
      expect(parseDirectoryQuery(params), JSON.stringify(params)).toBeNull();
    expect(parseDirectoryQuery({ q: 'x'.repeat(100) })).not.toBeNull();
  });

  it('maps a query to bounded RPC arguments', () => {
    const query = parseDirectoryQuery({ q: '+2010', page: '2' })!;
    expect(directoryRpcArgs(wsA, query)).toEqual({
      p_workspace_id: wsA,
      p_search: '+2010',
      p_approval_state: null,
      p_subscription_status: null,
      p_limit: 50,
      p_offset: 50,
    });
    expect(directoryHref(wsA, query, 3)).toBe(
      `/clients?workspace=${wsA}&q=%2B2010&page=3`,
    );
  });
});

describe('F22 directory workspace authorization (T033/T038 control; FR-010)', () => {
  it('allows coaching staff only in their active workspace and the verified PO everywhere', () => {
    expect(canReadDirectory(actor('trainer'), wsA)).toBe(true);
    expect(canReadDirectory(actor('workspace_owner'), wsA)).toBe(true);
    expect(canReadDirectory(actor('platform_owner', []), wsB)).toBe(true);
  });

  it('denies foreign workspaces, roles without coaching_work, clients and malformed ids', () => {
    expect(canReadDirectory(actor('trainer'), wsB)).toBe(false);
    expect(canReadDirectory(actor('workspace_owner', [wsB]), wsA)).toBe(false);
    expect(canReadDirectory(actor('sales'), wsA)).toBe(false);
    expect(canReadDirectory(actor(null), wsA)).toBe(false);
    expect(canReadDirectory(actor('trainer'), 'not-a-uuid')).toBe(false);
    expect(canReadDirectory(actor('trainer'), undefined)).toBe(false);
  });

  it('does not call the database for a foreign workspace', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'ok', clients: [row], has_more: false },
      error: null,
    }));
    const result = await loadClientDirectory(
      { rpc },
      actor('trainer'),
      wsB,
      parseDirectoryQuery({})!,
    );
    expect(result).toEqual({ status: 'not_permitted' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps the database wall denial to not_permitted without detail', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: '42501', message: 'not_permitted' },
    }));
    await expect(
      loadClientDirectory(
        { rpc },
        actor('trainer'),
        wsA,
        parseDirectoryQuery({})!,
      ),
    ).resolves.toEqual({ status: 'not_permitted' });
  });
});

describe('F22 directory result and indicator parsing (T030; SC-008)', () => {
  it('parses rows with the plans-waiting indicator', () => {
    expect(
      parseDirectoryResult(
        { status: 'ok', clients: [row], has_more: true },
        null,
      ),
    ).toEqual({
      status: 'ok',
      hasMore: true,
      rows: [
        {
          clientId,
          name: 'Synthetic client',
          approvalState: 'approved',
          subscriptionStatus: 'active',
          plansWaitingForDelivery: 2,
        },
      ],
    });
  });

  it('accepts an unresolvable (null) subscription status', () => {
    expect(
      parseDirectoryResult(
        {
          status: 'ok',
          clients: [{ ...row, subscription_status: null }],
          has_more: false,
        },
        null,
      ),
    ).toMatchObject({ status: 'ok', rows: [{ subscriptionStatus: null }] });
  });

  it('rejects rows carrying unexpected fields such as contact data', () => {
    for (const extra of [
      { email: 'synthetic@example.test' },
      { workspace_id: wsB },
    ])
      expect(
        parseDirectoryResult(
          { status: 'ok', clients: [{ ...row, ...extra }], has_more: false },
          null,
        ),
      ).toEqual({ status: 'unavailable' });
  });

  it('rejects malformed indicator counts and unknown states', () => {
    for (const patch of [
      { plans_waiting_for_delivery: -1 },
      { plans_waiting_for_delivery: 1.5 },
      { approval_state: 'deleted' },
      { subscription_status: 'overdue' },
    ])
      expect(
        parseDirectoryResult(
          { status: 'ok', clients: [{ ...row, ...patch }], has_more: false },
          null,
        ),
        JSON.stringify(patch),
      ).toEqual({ status: 'unavailable' });
  });

  it('keeps invalid input and transport failures closed', () => {
    expect(parseDirectoryResult({ status: 'invalid_input' }, null)).toEqual({
      status: 'invalid_input',
    });
    expect(parseDirectoryResult(null, { code: 'XX000' })).toEqual({
      status: 'unavailable',
    });
    expect(parseDirectoryResult({ status: 'ok' }, null)).toEqual({
      status: 'unavailable',
    });
  });
});
