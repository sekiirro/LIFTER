import { NextResponse, type NextRequest } from 'next/server';
import {
  markAlertRead,
  readAlertInbox,
} from '../../../../lib/forms/alert-inbox';
import {
  formsPrivateNoStoreHeaders,
  requestUsesHttps,
} from '../../../../lib/forms/privacy-contract';
import { createSessionClient } from '../../../../lib/supabase/server';

function response(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: formsPrivateNoStoreHeaders(),
  });
}

async function actorClient(request: NextRequest) {
  if (!requestUsesHttps(request)) return null;
  const client = await createSessionClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : client;
}

export async function GET(request: NextRequest) {
  const client = await actorClient(request);
  if (!client) return response({ status: 'not_found' }, 404);
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam === null ? 50 : Number(limitParam);
  const beforeParam = request.nextUrl.searchParams.get('before');
  const beforeMs = beforeParam === null ? null : Date.parse(beforeParam);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (beforeMs !== null && !Number.isFinite(beforeMs))
  )
    return response({ status: 'invalid' }, 400);
  const before = beforeMs === null ? null : new Date(beforeMs).toISOString();

  try {
    const result = await readAlertInbox(client, limit, before);
    return result.ok
      ? response({ status: 'ok', alerts: result.rows }, 200)
      : response({ status: 'unavailable' }, 503);
  } catch {
    return response({ status: 'unavailable' }, 503);
  }
}

export async function POST(request: NextRequest) {
  const client = await actorClient(request);
  if (!client) return response({ status: 'not_found' }, 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ status: 'invalid' }, 400);
  }
  if (
    !body ||
    typeof body !== 'object' ||
    typeof (body as Record<string, unknown>).delivery_id !== 'string'
  )
    return response({ status: 'invalid' }, 400);
  try {
    const status = await markAlertRead(
      client,
      (body as { delivery_id: string }).delivery_id,
    );
    return response(
      { status },
      status === 'read' ? 200 : status === 'not_found' ? 404 : 503,
    );
  } catch {
    return response({ status: 'unavailable' }, 503);
  }
}
