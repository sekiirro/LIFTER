import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { NextResponse, type NextRequest } from 'next/server';
import { getMessages } from '../../../../lib/i18n';
import { isEligibleStaffRole } from '../../../../lib/auth/staff-reset';
import {
  buildStaffResetEmailLink,
  isApprovedStaffResetTestRecipient,
  parseStaffResetHookPayload,
  STAFF_RESET_TEST_RECIPIENT,
  verifyStaffResetHookSignature,
} from '../../../../lib/auth/staff-reset-hook';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { readServerEnv } from '../../../../lib/supabase/env';

const MAX_HOOK_BODY_BYTES = 64 * 1024;
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
};

function emptyResponse(status = 200) {
  return NextResponse.json({}, { status, headers: privateHeaders });
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_HOOK_BODY_BYTES) return emptyResponse(413);

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_HOOK_BODY_BYTES)
    return emptyResponse(413);

  const validSignature = verifyStaffResetHookSignature(
    rawBody,
    {
      id: request.headers.get('webhook-id'),
      timestamp: request.headers.get('webhook-timestamp'),
      signature: request.headers.get('webhook-signature'),
    },
    process.env.STAFF_RESET_HOOK_SECRET,
  );
  if (!validSignature) return emptyResponse(401);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return emptyResponse(400);
  }

  const emailActionType =
    payload && typeof payload === 'object' && 'email_data' in payload
      ? (payload as { email_data?: { email_action_type?: unknown } }).email_data
          ?.email_action_type
      : null;
  if (emailActionType !== 'recovery') return emptyResponse();

  const env = readServerEnv();
  const event = parseStaffResetHookPayload(payload, env?.appOrigin);
  const admin = createAdminClient();
  if (!event || !admin || !env) return emptyResponse(400);

  try {
    const [
      { data: authUser, error: authError },
      { data: staff, error: staffError },
    ] = await Promise.all([
      admin.auth.admin.getUserById(event.userId),
      admin
        .from('staff_profiles')
        .select('role')
        .eq('user_id', event.userId)
        .maybeSingle(),
    ]);
    if (authError || staffError) return emptyResponse(503);

    const identityMatches =
      authUser.user?.email?.trim().toLowerCase() === event.email;
    const eligible =
      identityMatches && isEligibleStaffRole(staff?.role ?? null);
    const permitted = isApprovedStaffResetTestRecipient(event.email);
    const targetHash = createHash('sha256').update(event.email).digest('hex');
    const hookId = request.headers.get('webhook-id');
    if (!hookId) return emptyResponse(401);

    const { data: claim, error: claimError } = await admin.rpc(
      'staff_password_reset_hook_claim',
      {
        p_hook_id: hookId,
        p_auth_user_id: event.userId,
        p_target_hash_hex: targetHash,
        p_eligible: eligible,
        p_permitted: permitted,
      },
    );
    if (claimError) return emptyResponse(503);
    if (claim !== 'accepted') return emptyResponse();

    const { data: auditWritten, error: auditError } = await admin.rpc(
      'staff_password_reset_hook_audit',
      { p_hook_id: hookId },
    );
    if (auditError || auditWritten !== true) return emptyResponse(503);

    const link = buildStaffResetEmailLink(
      event.tokenHash,
      env.appOrigin,
      event.locale,
    );
    const messages = getMessages(event.locale);
    const smtpPort = Number(process.env.STAFF_RESET_LOCAL_SMTP_PORT ?? '45425');
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)
      return emptyResponse(503);
    const smtp = nodemailer.createTransport({
      host: '127.0.0.1',
      port: smtpPort,
      secure: false,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
    await smtp.sendMail({
      from: 'noreply@example.test',
      to: STAFF_RESET_TEST_RECIPIENT,
      subject: messages['auth.staffResetEmailSubject'],
      text: `${messages['auth.staffResetEmailBody']}\n\n${link}`,
    });
    return emptyResponse();
  } catch {
    // The hook returns no provider, identity, token, audit, or transport details.
    return emptyResponse(503);
  }
}
