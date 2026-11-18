import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import type { Actor } from '../../lib/auth/authorize';
import {
  canReadDirectory,
  canUseAssignment,
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
  refund_scope: null,
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
      assignment: null,
      page: 3,
    });
    expect(parseDirectoryQuery({})).toEqual({
      search: null,
      approvalState: null,
      subscriptionStatus: null,
      assignment: null,
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
      p_assignment: null,
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
          refundScope: null,
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

  it('carries the F13 full/partial refund scope for refunded rows (S57-PO-12)', () => {
    for (const scope of ['full', 'partial'] as const)
      expect(
        parseDirectoryResult(
          {
            status: 'ok',
            clients: [
              { ...row, subscription_status: 'refunded', refund_scope: scope },
            ],
            has_more: false,
          },
          null,
        ),
      ).toMatchObject({
        status: 'ok',
        rows: [{ subscriptionStatus: 'refunded', refundScope: scope }],
      });
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
      // refund_scope only accompanies refunded, and only full/partial.
      { refund_scope: 'full' },
      { subscription_status: 'refunded', refund_scope: null },
      { subscription_status: 'refunded', refund_scope: 'some' },
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

describe('F22 directory assignment filter behind the F11 wall (T035; FR-011, S40-PO-10 item 5)', () => {
  const assigned = { ...row, assignment: 'unassigned' };

  it('parses only the two F11 assignment states and echoes them in the href', () => {
    expect(parseDirectoryQuery({ assignment: 'unassigned' })).toMatchObject({
      assignment: 'unassigned',
    });
    expect(parseDirectoryQuery({ assignment: '' })).toMatchObject({
      assignment: null,
    });
    for (const assignment of ['Assigned', 'none', ['assigned', 'x']])
      expect(parseDirectoryQuery({ assignment })).toBeNull();
    const query = parseDirectoryQuery({ assignment: 'assigned' })!;
    expect(directoryHref(wsA, query, 1)).toBe(
      `/clients?workspace=${wsA}&assignment=assigned`,
    );
  });

  it('allows the filter only for the Workspace Owner of the workspace and the Platform Owner', () => {
    expect(canUseAssignment(actor('platform_owner', []), wsB)).toBe(true);
    expect(canUseAssignment(actor('workspace_owner'), wsA)).toBe(true);
    expect(canUseAssignment(actor('workspace_owner', [wsB]), wsA)).toBe(false);
    expect(canUseAssignment(actor('trainer'), wsA)).toBe(false);
    expect(canUseAssignment(actor('sales'), wsA)).toBe(false);
    expect(canUseAssignment(actor(null), wsA)).toBe(false);
    expect(canUseAssignment(actor('workspace_owner'), 'not-a-uuid')).toBe(
      false,
    );
  });

  it('sends the filter only when allowed', () => {
    const query = parseDirectoryQuery({ assignment: 'unassigned' })!;
    expect(directoryRpcArgs(wsA, query, true).p_assignment).toBe('unassigned');
    expect(directoryRpcArgs(wsA, query, false).p_assignment).toBeNull();
    expect(directoryRpcArgs(wsA, query).p_assignment).toBeNull();
  });

  it('ignores the parameter for a Trainer and strips any assignment state from the rows', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'ok', clients: [assigned], has_more: false },
      error: null,
    }));
    const query = parseDirectoryQuery({ assignment: 'unassigned' })!;
    const result = await loadClientDirectory(
      { rpc },
      actor('trainer'),
      wsA,
      query,
    );
    expect(rpc).toHaveBeenCalledWith(
      'staff_client_directory',
      expect.objectContaining({ p_assignment: null }),
    );
    expect(result).toMatchObject({ status: 'ok' });
    if (result.status === 'ok')
      for (const r of result.rows) expect('assignment' in r).toBe(false);
  });

  it('passes the filter and keeps the assignment state for the Workspace Owner and Platform Owner', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'ok', clients: [assigned], has_more: false },
      error: null,
    }));
    const query = parseDirectoryQuery({ assignment: 'unassigned' })!;
    for (const who of [actor('workspace_owner'), actor('platform_owner', [])]) {
      const result = await loadClientDirectory({ rpc }, who, wsA, query);
      expect(rpc).toHaveBeenLastCalledWith(
        'staff_client_directory',
        expect.objectContaining({ p_assignment: 'unassigned' }),
      );
      expect(result).toMatchObject({
        status: 'ok',
        rows: [{ assignment: 'unassigned' }],
      });
    }
  });

  it('rejects malformed assignment state in rows', () => {
    for (const value of ['mine', 1, undefined])
      expect(
        parseDirectoryResult(
          {
            status: 'ok',
            clients: [{ ...row, assignment: value }],
            has_more: false,
          },
          null,
        ),
      ).toEqual({ status: 'unavailable' });
    expect(
      parseDirectoryResult(
        {
          status: 'ok',
          clients: [{ ...row, assignment: null }],
          has_more: false,
        },
        null,
      ),
    ).toMatchObject({ rows: [{ assignment: null }] });
  });
});
