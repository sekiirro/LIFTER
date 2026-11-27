import { NextResponse, type NextRequest } from 'next/server';
import { requestUsesHttps } from '../../../../../lib/forms/privacy-contract';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { createSessionClient } from '../../../../../lib/supabase/server';

function response(status: number) {
  return new NextResponse(null, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!requestUsesHttps(request)) return response(404);
  const { jobId } = await context.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      jobId,
    )
  )
    return response(404);
  const session = await createSessionClient();
  if (!session) return response(404);
  const { data: user, error: authError } = await session.auth.getUser();
  if (authError || !user.user) return response(404);

  const { data: state, error: statusError } = await session.rpc(
    'read_po_client_export_status',
    { p_job_id: jobId },
  );
  if (statusError || !state || typeof state !== 'object') return response(404);
  if (state.status !== 'ready')
    return NextResponse.json(state, {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' },
    });

  // This RPC rechecks current PO status, requester ownership and expiry, then
  // writes the retrieval audit before this route releases any file bytes.
  const { data: path, error: auditError } = await session.rpc(
    'record_po_export_retrieval',
    { p_job_id: jobId },
  );
  if (auditError || typeof path !== 'string') return response(404);
  const admin = createAdminClient();
  if (!admin) return response(503);
  const { data: file, error: storageError } = await admin.storage
    .from('po-export-artifacts')
    .download(path);
  if (storageError || !file) return response(503);

  return new NextResponse(file, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      Pragma: 'no-cache',
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="po-client-export.csv"',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
