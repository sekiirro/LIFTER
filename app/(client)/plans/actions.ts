'use server';

import { revalidatePath } from 'next/cache';
import { getActor } from '../../../lib/auth/actor';
import {
  dismissClientNoticeForCurrentActor,
  markClientNoticeRead,
} from '../../../lib/client-access/notices';
import type {
  DismissNoticeResult,
  MarkNoticeResult,
} from '../../../lib/client-access/notices-projection';

/**
 * F22 US3: a client marks one own notice read. Staff never reach this; the
 * database re-derives the client and returns one `not_found` for foreign ids.
 */
export async function markClientNoticeReadAction(
  formData: FormData,
): Promise<MarkNoticeResult> {
  const actor = await getActor();
  if (!actor || actor.role !== null) return { status: 'denied' };
  const result = await markClientNoticeRead(formData.get('noticeId'));
  if (result.status === 'read') revalidatePath('/plans');
  return result;
}

/** `<form action>` entry point; the page re-renders from a fresh read. */
export async function markClientNoticeReadFormAction(
  formData: FormData,
): Promise<void> {
  await markClientNoticeReadAction(formData);
}

export async function dismissClientNoticeAction(
  formData: FormData,
): Promise<DismissNoticeResult> {
  const actor = await getActor();
  if (!actor || actor.role !== null) return { status: 'denied' };
  const result = await dismissClientNoticeForCurrentActor(
    formData.get('noticeId'),
  );
  if (result.status === 'dismissed') revalidatePath('/plans');
  return result;
}

export async function dismissClientNoticeFormAction(
  formData: FormData,
): Promise<void> {
  await dismissClientNoticeAction(formData);
}
