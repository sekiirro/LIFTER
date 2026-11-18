import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildStaffResetEmailLink,
  isApprovedStaffResetTestRecipient,
  parseStaffResetHookPayload,
  verifyStaffResetHookSignature,
} from '../../lib/auth/staff-reset-hook';
import { isEligibleStaffRole } from '../../lib/auth/staff-reset';

const hookKey = Buffer.from('test-hook-secret-32-bytes-long!!');
const hookSecret = `v1,whsec_${hookKey.toString('base64')}`;
const rawBody = JSON.stringify({ ok: true });
const timestamp = '1795000000';
const hookId = 'hook-event-1';

function signatureFor(body = rawBody, timestampValue = timestamp) {
  return createHmac('sha256', hookKey)
    .update(`${hookId}.${timestampValue}.${body}`)
    .digest('base64');
}

describe('staff reset hook boundary', () => {
  it('authorizes only staff roles for reset delivery', () => {
    for (const role of ['platform_owner', 'workspace_owner', 'trainer', 'sales'])
      expect(isEligibleStaffRole(role), role).toBe(true);
    for (const role of ['client', 'unknown', null])
      expect(isEligibleStaffRole(role), String(role)).toBe(false);
  });

  it('allows only the PO-approved local test recipient', () => {
    expect(isApprovedStaffResetTestRecipient('STAFF-RESET@example.test')).toBe(
      true,
    );
    expect(isApprovedStaffResetTestRecipient('outside@example.test')).toBe(
      false,
    );
  });

  it('accepts a matching current Standard Webhooks signature', () => {
    const signature = signatureFor();
    expect(
      verifyStaffResetHookSignature(
        rawBody,
        {
          id: hookId,
          timestamp,
          signature: `v1,${signature}`,
        },
        hookSecret,
        Number(timestamp),
      ),
    ).toBe(true);
  });

  it('rejects a changed body, stale timestamp, or malformed secret', () => {
    const signature = signatureFor();
    expect(
      verifyStaffResetHookSignature(
        `${rawBody} `,
        { id: hookId, timestamp, signature: `v1,${signature}` },
        hookSecret,
        Number(timestamp),
      ),
    ).toBe(false);
    expect(
      verifyStaffResetHookSignature(
        rawBody,
        { id: hookId, timestamp, signature: `v1,${signature}` },
        hookSecret,
        Number(timestamp) + 301,
      ),
    ).toBe(false);
    expect(
      verifyStaffResetHookSignature(
        rawBody,
        { id: hookId, timestamp, signature: `v1,${signature}` },
        'bad-secret',
        Number(timestamp),
      ),
    ).toBe(false);
  });

  it('parses only recovery payloads with a same-origin app redirect', () => {
    const event = parseStaffResetHookPayload(
      {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'staff-reset@example.test',
        },
        email_data: {
          email_action_type: 'recovery',
          token_hash: 'opaque-token-hash',
          redirect_to:
            'http://localhost:3104/auth/recovery?flow=staff&locale=en',
        },
      },
      'http://localhost:3104',
    );

    expect(event).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'staff-reset@example.test',
      tokenHash: 'opaque-token-hash',
      locale: 'en',
    });
    expect(
      parseStaffResetHookPayload(
        {
          user: { id: '11111111-1111-4111-8111-111111111111', email: 'x@test' },
          email_data: {
            email_action_type: 'signup',
            token_hash: 'opaque-token-hash',
            redirect_to: 'http://localhost:3104/auth/recovery',
          },
        },
        'http://localhost:3104',
      ),
    ).toBeNull();
  });

  it('rejects redirects outside the configured recovery page and defaults to Arabic', () => {
    const payload = {
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'staff-reset@example.test',
      },
      email_data: {
        email_action_type: 'recovery',
        token_hash: 'opaque-token-hash',
        redirect_to: 'https://attacker.example/auth/recovery?locale=en',
      },
    };
    expect(
      parseStaffResetHookPayload(payload, 'http://localhost:3104'),
    ).toBeNull();
    expect(
      parseStaffResetHookPayload(
        {
          ...payload,
          email_data: {
            ...payload.email_data,
            redirect_to: 'http://localhost:3104/auth/recovery',
          },
        },
        'http://localhost:3104',
      )?.locale,
    ).toBe('ar');
  });

  it('builds the scanner-safe app recovery URL with the approved locale marker', () => {
    const link = new URL(
      buildStaffResetEmailLink(
        'opaque-token-hash',
        'http://localhost:3104',
        'en',
      ),
    );
    expect(link.pathname).toBe('/auth/recovery');
    expect(link.searchParams.get('token_hash')).toBe('opaque-token-hash');
    expect(link.searchParams.get('type')).toBe('recovery');
    expect(link.searchParams.get('flow')).toBe('staff');
    expect(link.searchParams.get('locale')).toBe('en');
  });
});
