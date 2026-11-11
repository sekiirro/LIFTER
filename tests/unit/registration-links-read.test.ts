import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({
  session: vi.fn(),
  packages: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: m.session,
}));
vi.mock('../../lib/packages/read', () => ({
  loadPackageOffers: m.packages,
  SAFE_VERSION_COLUMNS:
    'workspace_id,id,offer_id,version,name_ar,name_en,price_minor,currency,duration_days,duration_months,published_at,published_by',
}));
import {
  loadRegistrationLinks,
  SAFE_INSTALLMENT_COLUMNS,
  SAFE_LINK_COLUMNS,
} from '../../lib/registration-links/read';
const ws = '00000000-0000-0000-0000-000000000001',
  id = '00000000-0000-0000-0000-000000000002',
  version2 = '00000000-0000-0000-0000-000000000003';
const NOW = Date.parse('2026-01-01T12:00:00Z');
const uuid = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const actor = { userId: id, role: 'sales' as const, activeWorkspaceIds: [ws] };
type Query = {
  table: string;
  selectColumns?: string;
  eqCalls: [string, unknown][];
  orderCalls: [string, unknown][];
  limitValue?: number;
  inCall?: [string, unknown[]];
  select: (columns: string) => Query;
  eq: (column: string, value: unknown) => Query;
  order: (column: string, options?: unknown) => Query;
  limit: (value: number) => Query;
  in: (column: string, values: unknown[]) => Query;
  then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
};
let rows: Record<string, unknown>[],
  children: Record<string, unknown>[],
  currentVersions: Record<string, unknown>[],
  linkError: unknown,
  childError: unknown,
  queries: Query[],
  events: string[];
const baseRow = (overrides: Record<string, unknown> = {}) => ({
  workspace_id: ws,
  id,
  package_version_id: id,
  created_by: id,
  created_at: '2026-01-01T00:00:00Z',
  expires_at: '2026-01-02T00:00:00Z',
  opened_at: null,
  consumed_at: null,
  price_minor: '9007199254740993',
  currency: 'XTS',
  duration_days: 61,
  duration_months: null,
  token_hash: 'secret',
  commission_rate_bp: 99,
  ...overrides,
});
const makeQuery = (table: string): Query => {
  const q: Query = {
    table,
    eqCalls: [],
    orderCalls: [],
    select(columns) {
      q.selectColumns = columns;
      return q;
    },
    eq(column, value) {
      q.eqCalls.push([column, value]);
      return q;
    },
    order(column, options) {
      q.orderCalls.push([column, options]);
      return q;
    },
    limit(value) {
      q.limitValue = value;
      return q;
    },
    in(column, values) {
      q.inCall = [column, values];
      return q;
    },
    then(resolve) {
      events.push(table);
      return Promise.resolve(
        table === 'registration_links_safe'
          ? { data: rows, error: linkError }
          : table === 'registration_link_installments_safe'
            ? { data: children, error: childError }
            : { data: currentVersions, error: null },
      ).then(resolve);
    },
  };
  return q;
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  rows = [baseRow()];
  children = [];
  currentVersions = [
    { id, workspace_id: ws, price_minor: '1200' },
    { id: version2, workspace_id: ws, price_minor: '1200' },
    { id: ws, workspace_id: ws, price_minor: '1200' },
  ];
  linkError = null;
  childError = null;
  queries = [];
  events = [];
  m.packages.mockResolvedValue({
    status: 'ok',
    offers: [
      { current_version_id: id, available: true, tier_rank: 2 },
      { current_version_id: ws, available: false, tier_rank: 3 },
    ],
    versions: [{ id }, { id: ws }],
  });
  m.rpc.mockImplementation(() => {
    events.push('commission');
    return Promise.resolve({
      data: [{ link_id: id, commission_rate_bp: 17 }],
      error: null,
    });
  });
  m.from.mockImplementation((table: string) => {
    const q = makeQuery(table);
    queries.push(q);
    return q;
  });
  m.session.mockResolvedValue({ from: m.from, rpc: m.rpc });
});
afterEach(() => vi.restoreAllMocks());
it('authorizes before any reads', async () => {
  expect(
    await loadRegistrationLinks({ ...actor, activeWorkspaceIds: [] }, ws),
  ).toEqual({ status: 'not_permitted' });
  expect(m.session).not.toHaveBeenCalled();
  expect(m.packages).not.toHaveBeenCalled();
});
it('uses explicit safe projections and the deterministic recent batch', async () => {
  const r = await loadRegistrationLinks(actor, ws);
  expect(r.status).toBe('ok');
  if (r.status !== 'ok') return;
  const linkQuery = queries.find((q) => q.table === 'registration_links_safe')!;
  expect(linkQuery.selectColumns).toBe(SAFE_LINK_COLUMNS);
  expect(linkQuery.selectColumns).not.toContain('*');
  expect(linkQuery.eqCalls).toEqual([['workspace_id', ws]]);
  expect(linkQuery.orderCalls).toEqual([
    ['created_at', { ascending: false }],
    ['id', { ascending: false }],
  ]);
  expect(linkQuery.limitValue).toBe(50);
  const childQuery = queries.find(
    (q) => q.table === 'registration_link_installments_safe',
  )!;
  expect(childQuery.selectColumns).toBe(SAFE_INSTALLMENT_COLUMNS);
  expect(childQuery.eqCalls).toEqual([['workspace_id', ws]]);
  expect(childQuery.inCall).toEqual(['link_id', [id]]);
  expect(childQuery.orderCalls).toEqual([['seq', undefined]]);
  expect(r.links[0]!.price_minor).toBe('9007199254740993');
  expect(r.links[0]!.status).toBe('valid');
  expect(r.links[0]).not.toHaveProperty('token_hash');
  expect(r.links[0]).not.toHaveProperty('commission_rate_bp');
  expect(m.rpc).not.toHaveBeenCalled();
});
it('filters F9 offers to available current versions only', async () => {
  m.packages.mockResolvedValue({
    status: 'ok',
    offers: [
      { current_version_id: id, available: true, tier_rank: 1 },
      { current_version_id: version2, available: true, tier_rank: 3 },
      { current_version_id: ws, available: false, tier_rank: 2 },
      { current_version_id: null, available: true, tier_rank: 1 },
    ],
    versions: [{ id }, { id: version2 }, { id: ws }, { id: uuid(9) }],
  });
  const r = await loadRegistrationLinks(actor, ws);
  expect(r.status).toBe('ok');
  if (r.status === 'ok')
    expect(r.offers.map((v) => [v.id, v.tier_rank])).toEqual([
      [id, 1],
      [version2, 3],
    ]);
});
it('fetches current versions explicitly when history omits them', async () => {
  m.packages.mockResolvedValue({
    status: 'ok',
    offers: [{ current_version_id: id, available: true, tier_rank: 2 }],
    versions: [],
  });
  const r = await loadRegistrationLinks(actor, ws);
  expect(r.status).toBe('ok');
  if (r.status === 'ok')
    expect(r.offers.map((v) => [v.id, v.tier_rank])).toEqual([[id, 2]]);
  const query = queries.find((q) => q.table === 'package_versions_safe')!;
  expect(query.selectColumns).toBe(
    'workspace_id,id,offer_id,version,name_ar,name_en,price_minor,currency,duration_days,duration_months,published_at,published_by',
  );
  expect(query.eqCalls).toEqual([['workspace_id', ws]]);
  expect(query.inCall).toEqual(['id', [id]]);
});
it('fails closed when an available current version has no immutable rank', async () => {
  m.packages.mockResolvedValue({
    status: 'ok',
    offers: [{ current_version_id: id, available: true }],
    versions: [{ id }],
  });
  expect(await loadRegistrationLinks(actor, ws)).toEqual({
    status: 'unavailable',
  });
});
it('computes consumed/expired/opened/valid status with server time', async () => {
  rows = [
    baseRow({ id: uuid(1) }),
    baseRow({
      id: uuid(2),
      opened_at: '2026-01-01T11:00:00Z',
    }),
    baseRow({
      id: uuid(3),
      expires_at: '2026-01-01T11:00:00Z',
    }),
    baseRow({
      id: uuid(4),
      expires_at: '2026-01-01T11:00:00Z',
      opened_at: '2026-01-01T10:00:00Z',
    }),
    baseRow({
      id: uuid(5),
      opened_at: '2026-01-01T10:00:00Z',
      consumed_at: '2026-01-01T11:00:00Z',
    }),
    baseRow({
      id: uuid(6),
      expires_at: '2026-01-01T11:00:00Z',
      consumed_at: '2026-01-01T10:00:00Z',
    }),
  ];
  const r = await loadRegistrationLinks(actor, ws);
  expect(r.status).toBe('ok');
  if (r.status === 'ok')
    expect(r.links.map((l) => l.status)).toEqual([
      'valid',
      'opened',
      'expired',
      'expired',
      'consumed',
      'consumed',
    ]);
});
it('preserves the provider recent order and the 50-row technical batch', async () => {
  rows = Array.from({ length: 50 }, (_, i) =>
    baseRow({
      id: uuid(100 + i),
      created_at: `2026-01-01T${String(23 - (i % 24)).padStart(2, '0')}:00:00Z`,
    }),
  );
  const r = await loadRegistrationLinks(actor, ws);
  expect(r.status).toBe('ok');
  if (r.status === 'ok') {
    expect(r.links).toHaveLength(50);
    expect(r.links.map((l) => l.id)).toEqual(rows.map((row) => row.id));
  }
});
it.each(['sales', 'trainer'] as const)(
  '%s never calls the commission RPC even when it accepts',
  async (role) => {
    const r = await loadRegistrationLinks({ ...actor, role }, ws);
    expect(r.status).toBe('ok');
    expect(m.rpc).not.toHaveBeenCalled();
    if (r.status === 'ok')
      expect(r.links[0]).not.toHaveProperty('commission_rate_bp');
  },
);
it.each(['platform_owner', 'workspace_owner'] as const)(
  '%s fetches commissions only after the scoped link reads',
  async (role) => {
    const r = await loadRegistrationLinks({ ...actor, role }, ws);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.links[0]!.commission_rate_bp).toBe(17);
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith(
      'get_registration_link_commissions',
      { workspace_id: ws },
    );
    expect(events.indexOf('commission')).toBeGreaterThan(
      events.indexOf('registration_link_installments_safe'),
    );
  },
);
it('rejects unsafe money and foreign provider rows generically', async () => {
  rows[0]!.price_minor = 9007199254740992;
  expect(await loadRegistrationLinks(actor, ws)).toEqual({
    status: 'unavailable',
  });
  rows[0]!.price_minor = '1200';
  rows[0]!.workspace_id = id;
  expect(await loadRegistrationLinks(actor, ws)).toEqual({
    status: 'unavailable',
  });
});
it('rejects child rows outside the listed link/workspace scope', async () => {
  rows = [baseRow({ id: uuid(1) })];
  children = [
    {
      workspace_id: ws,
      link_id: uuid(2),
      seq: 1,
      amount_minor: '1200',
      due_offset_days: 0,
    },
  ];
  expect(await loadRegistrationLinks(actor, ws)).toEqual({
    status: 'unavailable',
  });
  children[0]!.link_id = uuid(1);
  children[0]!.workspace_id = id;
  expect(await loadRegistrationLinks(actor, ws)).toEqual({
    status: 'unavailable',
  });
});
it('keeps exact child text and accepts only listed IDs', async () => {
  rows = [baseRow({ id: uuid(1) })];
  children = [
    {
      workspace_id: ws,
      link_id: uuid(1),
      seq: 1,
      amount_minor: '9007199254740993',
      due_offset_days: 0,
    },
  ];
  const r = await loadRegistrationLinks(actor, ws);
  expect(r.status).toBe('ok');
  if (r.status === 'ok') {
    expect(r.installments).toEqual(children);
    expect(m.rpc).not.toHaveBeenCalled();
  }
});
it('fails generically on session/package/link/child/commission errors', async () => {
  m.session.mockResolvedValue(null);
  expect(await loadRegistrationLinks(actor, ws)).toEqual({
    status: 'unavailable',
  });
  expect(m.packages).not.toHaveBeenCalled();
  m.session.mockResolvedValue({ from: m.from, rpc: m.rpc });
  m.packages.mockResolvedValue({ status: 'unavailable' });
  expect(await loadRegistrationLinks(actor, ws)).toEqual({
    status: 'unavailable',
  });
  expect(m.from).not.toHaveBeenCalled();
  m.packages.mockResolvedValue({
    status: 'ok',
    offers: [{ current_version_id: id, available: true }],
    versions: [{ id }],
  });
  linkError = { message: 'private' };
  expect(await loadRegistrationLinks(actor, ws)).toEqual({
    status: 'unavailable',
  });
  linkError = null;
  childError = { message: 'private' };
  expect(await loadRegistrationLinks(actor, ws)).toEqual({
    status: 'unavailable',
  });
  childError = null;
  m.rpc.mockResolvedValue({ data: null, error: { message: 'private' } });
  expect(
    await loadRegistrationLinks({ ...actor, role: 'workspace_owner' }, ws),
  ).toEqual({ status: 'unavailable' });
  m.session.mockRejectedValue(new Error('private'));
  expect(await loadRegistrationLinks(actor, ws)).toEqual({
    status: 'unavailable',
  });
});
it('does not cache or leak a previous call result', async () => {
  rows = [baseRow({ id: uuid(1) })];
  const first = await loadRegistrationLinks(actor, ws);
  rows = [baseRow({ id: uuid(2) })];
  const second = await loadRegistrationLinks(actor, ws);
  expect(m.session).toHaveBeenCalledTimes(2);
  expect(m.packages).toHaveBeenCalledTimes(2);
  expect(first.status).toBe('ok');
  expect(second.status).toBe('ok');
  if (first.status === 'ok' && second.status === 'ok') {
    expect(first.links[0]!.id).toBe(uuid(1));
    expect(second.links[0]!.id).toBe(uuid(2));
  }
});
it('fails closed when the commission reader omits a listed link', async () => {
  m.rpc.mockResolvedValue({ data: [], error: null });
  expect(
    await loadRegistrationLinks({ ...actor, role: 'workspace_owner' }, ws),
  ).toEqual({ status: 'unavailable' });
});
