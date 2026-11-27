import 'server-only';
import { createSessionClient } from '../supabase/server';
import { isUuid } from './portal-projection';
import {
  projectClientNotices,
  projectDismissNoticeResult,
  projectMarkNoticeResult,
  type ClientNotices,
  type DismissNoticeResult,
  type MarkNoticeResult,
} from './notices-projection';

type NoticeRpc = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export const NOTICE_PAGE_SIZE = 20;

/** Fresh server read; the database derives the client from the signed identity. */
export async function loadClientNotices(
  client: NoticeRpc,
): Promise<ClientNotices> {
  try {
    const { data, error } = await client.rpc('read_client_notices', {
      p_limit: NOTICE_PAGE_SIZE,
      p_before: null,
    });
    if (error) return { status: 'denied' };
    return projectClientNotices(data);
  } catch {
    return { status: 'denied' };
  }
}

export async function markClientNotice(
  client: NoticeRpc,
  noticeId: unknown,
): Promise<MarkNoticeResult> {
  if (!isUuid(noticeId)) return { status: 'not_found' };
  try {
    const { data, error } = await client.rpc('mark_client_notice_read', {
      p_notice_id: noticeId,
    });
    if (error) return { status: 'denied' };
    return projectMarkNoticeResult(data);
  } catch {
    return { status: 'denied' };
  }
}

export async function dismissClientNotice(
  client: NoticeRpc,
  noticeId: unknown,
): Promise<DismissNoticeResult> {
  if (!isUuid(noticeId)) return { status: 'not_found' };
  try {
    const { data, error } = await client.rpc('dismiss_client_notice', {
      p_notice_id: noticeId,
    });
    if (error) return { status: 'denied' };
    return projectDismissNoticeResult(data);
  } catch {
    return { status: 'denied' };
  }
}

export async function readClientNotices(): Promise<ClientNotices> {
  const client = await createSessionClient();
  if (!client) return { status: 'denied' };
  return loadClientNotices(client);
}

export async function markClientNoticeRead(
  noticeId: unknown,
): Promise<MarkNoticeResult> {
  const client = await createSessionClient();
  if (!client) return { status: 'denied' };
  return markClientNotice(client, noticeId);
}

export async function dismissClientNoticeForCurrentActor(
  noticeId: unknown,
): Promise<DismissNoticeResult> {
  const client = await createSessionClient();
  if (!client) return { status: 'denied' };
  return dismissClientNotice(client, noticeId);
}
