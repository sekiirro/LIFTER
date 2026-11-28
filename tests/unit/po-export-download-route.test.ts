import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  createSession: vi.fn(),
  createAdmin: vi.fn(),
  auth: vi.fn(),
  rpc: vi.fn(),
  download: vi.fn(),
  events: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: m.createSession,
}));
vi.mock('../../lib/supabase/admin', () => ({
  createAdminClient: m.createAdmin,
}));

import { GET } from '../../app/api/reports/po-export/[jobId]/route';

const jobId = '00000000-0000-4000-8000-000000000001';
const context = { params: Promise.resolve({ jobId }) };

function request() {
  return new Request(
    `https://app.example.test/api/reports/po-export/${jobId}`,
    {
      headers: { 'x-forwarded-proto': 'https' },
    },
  ) as never;
}

beforeEach(() => {
  m.events.length = 0;
  m.auth.mockResolvedValue({ data: { user: { id: 'po-user' } }, error: null });
  m.rpc.mockImplementation(async (name: string) => {
    m.events.push(name);
    if (name === 'read_po_client_export_status')
      return { data: { status: 'ready' }, error: null };
    return { data: `${jobId}/lease/archive.csv`, error: null };
  });
  m.download.mockImplementation(async () => {
    m.events.push('storage.download');
    return { data: new Blob(['id\r\n']), error: null };
  });
  m.createSession.mockResolvedValue({ auth: { getUser: m.auth }, rpc: m.rpc });
  m.createAdmin.mockReturnValue({
    storage: { from: () => ({ download: m.download }) },
  });
});

describe('PO export HTTP download route', () => {
  it('denies non-PO and requester-mismatched jobs without storage access', async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    const roleDenied = await GET(request(), context);
    expect(roleDenied.status).toBe(404);
    expect(m.download).not.toHaveBeenCalled();

    m.rpc.mockReset();
    m.rpc.mockImplementation(async (name: string) => {
      m.events.push(name);
      return name === 'read_po_client_export_status'
        ? { data: { status: 'ready' }, error: null }
        : { data: null, error: { code: '42501' } };
    });
    const requesterDenied = await GET(request(), context);
    expect(requesterDenied.status).toBe(404);
    expect(m.download).not.toHaveBeenCalled();
  });

  it('audits retrieval before storage bytes and releases no bytes on audit failure', async () => {
    const downloaded = await GET(request(), context);
    expect(downloaded.status).toBe(200);
    expect(m.events).toEqual([
      'read_po_client_export_status',
      'record_po_export_retrieval',
      'storage.download',
    ]);
    expect(downloaded.headers.get('cache-control')).toContain('no-store');

    m.events.length = 0;
    m.download.mockClear();
    m.rpc.mockImplementation(async (name: string) => {
      m.events.push(name);
      return name === 'read_po_client_export_status'
        ? { data: { status: 'ready' }, error: null }
        : { data: null, error: { code: 'audit_failed' } };
    });
    const auditDenied = await GET(request(), context);
    expect(auditDenied.status).toBe(404);
    expect(await auditDenied.text()).toBe('');
    expect(m.download).not.toHaveBeenCalled();
  });

  it('records the failure outcome when storage delivery fails (NB-030-04)', async () => {
    m.download.mockImplementationOnce(async () => {
      m.events.push('storage.download');
      return {
        data: null,
        error: { message: 'storage temporarily unavailable' },
      };
    });
    const failed = await GET(request(), context);
    expect(failed.status).toBe(503);
    expect(await failed.text()).toBe('');
    expect(m.events).toEqual([
      'read_po_client_export_status',
      'record_po_export_retrieval',
      'storage.download',
      'record_po_export_retrieval_failure',
    ]);
    expect(m.rpc).toHaveBeenCalledWith('record_po_export_retrieval_failure', {
      p_job_id: jobId,
    });
  });

  it('does not download expired jobs', async () => {
    m.rpc.mockResolvedValue({ data: { status: 'expired' }, error: null });
    const expired = await GET(request(), context);
    expect(expired.status).toBe(200);
    expect(await expired.text()).toContain('expired');
    expect(m.download).not.toHaveBeenCalled();
  });
});
