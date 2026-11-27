import 'server-only';
import { createSessionClient } from '../../supabase/server';
import {
  dismissStaffNoticeResult,
  markStaffNoticeResult,
  parseStaffNotices,
  type StaffNoticesResult,
} from './notice-projection';

export { STAFF_NOTICE_MESSAGE, type StaffNotice } from './notice-projection';

/**
 * FR-027/FR-036: the signed-in staff member's own in-app notices (food
 * replacement requests that opened). The RPC is the wall: recipient only, and
 * only for workspaces where the caller still has coaching access.
 */
export async function readStaffNotices(): Promise<StaffNoticesResult> {
  const session = await createSessionClient();
  if (!session) return { status: 'unavailable' };
  const result = await session.rpc('read_staff_notices', {});
  if (result.error)
    return {
      status: result.error.code === '42501' ? 'denied' : 'unavailable',
    };
  return parseStaffNotices(result.data);
}

export async function markStaffNoticeRead(
  noticeId: string,
): Promise<'read' | 'not_found' | 'denied' | 'unavailable'> {
  const session = await createSessionClient();
  if (!session) return 'unavailable';
  const result = await session.rpc('mark_staff_notice_read', {
    p_notice_id: noticeId,
  });
  if (result.error)
    return result.error.code === '42501' ? 'denied' : 'unavailable';
  return markStaffNoticeResult(result.data);
}

export async function dismissStaffNotice(
  noticeId: string,
): Promise<'dismissed' | 'not_found' | 'denied' | 'unavailable'> {
  const session = await createSessionClient();
  if (!session) return 'unavailable';
  const result = await session.rpc('dismiss_staff_notice', {
    p_notice_id: noticeId,
  });
  if (result.error)
    return result.error.code === '42501' ? 'denied' : 'unavailable';
  return dismissStaffNoticeResult(result.data);
}
