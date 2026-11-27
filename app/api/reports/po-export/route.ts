import { NextResponse, type NextRequest } from 'next/server';
import { requestUsesHttps } from '../../../../lib/forms/privacy-contract';
import { createSessionClient } from '../../../../lib/supabase/server';

function response(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' },
  });
}

export async function POST(request: NextRequest) {
  if (!requestUsesHttps(request)) return response({ status: 'not_found' }, 404);
  const client = await createSessionClient();
  if (!client) return response({ status: 'not_found' }, 404);
  const { data, error: authError } = await client.auth.getUser();
  if (authError || !data.user) return response({ status: 'not_found' }, 404);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return response({ status: 'invalid' }, 400);
  }
  if (!input || typeof input !== 'object')
    return response({ status: 'invalid' }, 400);
  const body = input as Record<string, unknown>;
  const workspaceId = body.workspace_id;
  const idempotencyKey = body.idempotency_key;
  if (
    (workspaceId !== null &&
      (typeof workspaceId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          workspaceId,
        ))) ||
    typeof idempotencyKey !== 'string' ||
    !/^[A-Za-z0-9_-]{16,96}$/u.test(idempotencyKey)
  )
    return response({ status: 'invalid' }, 400);

  const { data: jobId, error } = await client.rpc('request_po_client_export', {
    p_workspace_id: workspaceId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return response({ status: 'not_found' }, 404);
  return response({ status: 'queued', job_id: jobId }, 202);
}
