'use server';

import { createSessionClient } from '../../../lib/supabase/server';
import { readAlertInbox, markAlertRead } from '../../../lib/forms/alert-inbox';
import {
  readStaffNotices,
  markStaffNoticeRead,
  dismissStaffNotice,
} from '../../../lib/progress-coaching/food-replacement/notifications';

export type UnifiedStaffNotification =
  | {
      type: 'form_alert';
      id: string;
      stage: string;
      workspaceId: string;
      createdAt: string;
      readAt: string | null;
    }
  | {
      type: 'staff_notice';
      id: string;
      kind: string;
      workspaceId: string;
      sourceKey: string;
      createdAt: string;
      readAt: string | null;
      dismissedAt?: string | null;
      clientName?: string;
      expiryDate?: string;
    };

export async function fetchStaffNotificationsAction(): Promise<{
  status: 'ok' | 'error';
  notifications: UnifiedStaffNotification[];
}> {
  try {
    const client = await createSessionClient();
    if (!client) return { status: 'error', notifications: [] };

    const [alertsResult, noticesResult] = await Promise.all([
      readAlertInbox(client, 50).catch(() => ({ ok: false as const })),
      readStaffNotices().catch(() => ({ status: 'unavailable' as const })),
    ]);

    const notifications: UnifiedStaffNotification[] = [];

    if (alertsResult.ok) {
      for (const alert of alertsResult.rows) {
        notifications.push({
          type: 'form_alert',
          id: alert.delivery_id,
          stage: alert.stage,
          workspaceId: alert.workspace_id,
          createdAt: alert.created_at,
          readAt: alert.read_at,
        });
      }
    }

    if (noticesResult.status === 'ok') {
      for (const notice of noticesResult.notices) {
        notifications.push({
          type: 'staff_notice',
          id: notice.noticeId,
          kind: notice.kind,
          workspaceId: notice.workspaceId,
          sourceKey: notice.requestId,
          createdAt: notice.createdAt,
          readAt: notice.readAt,
          dismissedAt: notice.dismissedAt,
          clientName: notice.clientName,
          expiryDate: notice.expiryDate,
        });
      }
    }

    // Both failing is an error; if at least one succeeded, return ok
    if (!alertsResult.ok && noticesResult.status !== 'ok') {
      return { status: 'error', notifications: [] };
    }

    // Sort descending by creation date
    notifications.sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );

    return { status: 'ok', notifications };
  } catch {
    return { status: 'error', notifications: [] };
  }
}

export async function markStaffNotificationReadAction(
  type: 'form_alert' | 'staff_notice',
  id: string,
): Promise<{ status: 'ok' | 'not_found' | 'error' }> {
  try {
    if (type === 'form_alert') {
      const client = await createSessionClient();
      if (!client) return { status: 'error' };
      const res = await markAlertRead(client, id);
      if (res === 'read') return { status: 'ok' };
      if (res === 'not_found') return { status: 'not_found' };
      return { status: 'error' };
    }

    if (type === 'staff_notice') {
      const res = await markStaffNoticeRead(id);
      if (res === 'read') return { status: 'ok' };
      if (res === 'not_found') return { status: 'not_found' };
      return { status: 'error' };
    }

    return { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

export async function dismissStaffNotificationAction(
  type: 'form_alert' | 'staff_notice',
  id: string,
): Promise<{ status: 'ok' | 'not_found' | 'error' }> {
  try {
    if (type === 'staff_notice') {
      const res = await dismissStaffNotice(id);
      if (res === 'dismissed') return { status: 'ok' };
      if (res === 'not_found') return { status: 'not_found' };
      return { status: 'error' };
    }

    // F15 form alerts: no dismiss unless an existing dismiss RPC already exists
    return { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}
