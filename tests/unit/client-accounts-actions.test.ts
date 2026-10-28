import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { signupResult } from '../../lib/client-accounts/results';
import { processClientSignup } from '../../lib/client-accounts/service';
import { getMessages } from '../../lib/i18n';
import {
  signupFields,
  validateSignupFields,
} from '../../lib/client-accounts/validation';

const signupRpcSpy = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc: signupRpcSpy })),
}));

it('T023 public results contain only contract status, translated copy and safe field names', () => {
  const invalid = signupResult('invalid_input', 'en', ['email', 'phone']);
  expect(invalid).toEqual({
    status: 'invalid_input',
    message: 'Check the highlighted fields and try again.',
    invalidFields: ['email', 'phone'],
  });
  const duplicate = signupResult('duplicate', 'en');
  expect(duplicate).toEqual({
    status: 'duplicate',
    message: 'This email is already registered. Contact support.',
  });
  expect(Object.keys(duplicate).sort()).toEqual(['message', 'status']);
  expect(signupResult('unavailable', 'ar').message.length).toBeGreaterThan(0);
});

it('T023 strict signup shape rejects unknown fields and accepts only the four approved fields', () => {
  const accepted = {
    name: 'Example Person',
    email: 'example@example.test',
    phone: '+201012345678',
    password: 'Complex!2345',
  };
  expect(signupFields(accepted) !== null).toBe(true);
  expect(signupFields({ ...accepted, workspace_id: 'fixture' }) === null).toBe(
    true,
  );
  expect(
    validateSignupFields({ ...accepted, role: 'admin' }).invalidFields.length >
      0,
  ).toBe(true);
});

function source(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

it('T023 server action delegates to the signup service without admin authority', () => {
  const action = source('app/register/[token]/actions.ts');
  const service = source('lib/client-accounts/service.ts');
  const results = source('lib/client-accounts/results.ts');

  expect(action, 'server action exists').not.toBe('');
  expect(service, 'server-only service exists').not.toBe('');
  expect(results, 'public result mapper exists').not.toBe('');
  expect(action).toContain("'use server'");
  expect(action).toContain('processClientSignup');
  expect(service.startsWith("import 'server-only';")).toBe(true);
  expect(service).toContain("from '@supabase/supabase-js'");
  expect(service).toContain('persistSession: false');
  expect(service).not.toMatch(
    /supabase\/admin|SUPABASE_SERVICE_ROLE_KEY|service_role/i,
  );
  expect(action).not.toMatch(
    /supabase\/admin|SUPABASE_SERVICE_ROLE_KEY|service_role/i,
  );
});

it('T023 signup action import graph never reaches the admin client or service-role key', () => {
  const visited = new Set<string>();
  const pending = [resolve('app/register/[token]/actions.ts')];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (visited.has(file) || !existsSync(file) || !statSync(file).isFile())
      continue;
    visited.add(file);
    const contents = readFileSync(file, 'utf8');
    expect(file.replaceAll('\\', '/')).not.toMatch(/lib\/supabase\/admin\.ts$/);
    expect(contents).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role/i);
    for (const [, specifier] of contents.matchAll(
      /(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g,
    )) {
      const base = resolve(dirname(file), specifier!);
      pending.push(
        ...['', '.ts', '.tsx', '.mjs', '.js', '/index.ts'].map(
          (suffix) => `${base}${suffix}`,
        ),
      );
    }
  }
  expect(visited.size).toBeGreaterThan(4);
});

it('T023 preserves the required action order and sends only derived admission proof to RPCs', () => {
  const service = source('lib/client-accounts/service.ts');
  const body = service.slice(
    service.indexOf('export async function processClientSignup'),
  );
  const trustedIp = source('lib/client-accounts/trusted-ip.ts');
  const origin = body.indexOf('origin === expectedOrigin');
  const shape = body.indexOf('hasSignupFieldShape');
  const phone = body.indexOf('normalizePhone');
  const validation = body.indexOf('validateSignupFields');
  const signupFieldsIndex = body.indexOf('signupFields');
  const ip = body.indexOf('trustedIp(');
  const admission = body.indexOf('buildAdmission(');
  const admitRpc = body.indexOf("rpc('client_signup_admit'");
  const signupRpc = body.indexOf("rpc('client_signup'");

  expect(origin, 'same-origin check exists').toBeGreaterThanOrEqual(0);
  expect(shape, 'strict field validation exists').toBeGreaterThan(origin);
  expect(phone, 'phone adapter follows strict shape check').toBeGreaterThan(
    shape,
  );
  expect(validation, 'field validation follows phone adapter').toBeGreaterThan(
    phone,
  );
  expect(
    signupFieldsIndex,
    'validated signup fields follow field checks',
  ).toBeGreaterThan(validation);
  expect(ip, 'trusted IP lookup follows validation').toBeGreaterThan(
    signupFieldsIndex,
  );
  expect(admission, 'attestation builder follows trusted IP').toBeGreaterThan(
    ip,
  );
  expect(admitRpc, 'admission RPC follows the builder').toBeGreaterThan(
    admission,
  );
  expect(signupRpc, 'signup RPC follows admission').toBeGreaterThan(admitRpc);
  const admitArguments = body.slice(
    admitRpc,
    body.indexOf('if (admitted.error)', admitRpc),
  );
  const signupArguments = body.slice(
    signupRpc,
    body.indexOf('if (completed.error)', signupRpc),
  );
  expect(admitArguments).toContain('ip_key:');
  expect(admitArguments).not.toMatch(/\bip\s*:/);
  expect(signupArguments).not.toMatch(/\bip\s*:/);
  expect(service).toContain('trustedIp(');
  expect(trustedIp).toContain("headers.get('CF-Connecting-IP')");
  expect(service).toContain('allowTestOverride');
  expect(trustedIp).not.toContain('X-Forwarded-For');
  expect(service).toContain('ip_key');
  expect(service).toContain('link_key');
  expect(service).toContain('attestation');
});

it('T023 keeps tokens and submitted identity values out of public result code and logs', () => {
  const action = source('app/register/[token]/actions.ts');
  const service = source('lib/client-accounts/service.ts');
  const results = source('lib/client-accounts/results.ts');

  expect(results).toContain("'duplicate'");
  expect(results).toContain('getMessages');
  expect(results).toContain('clientSignup.duplicate');
  expect(results).not.toContain(
    'This email is already registered. Contact support.',
  );
  expect(getMessages('en')['clientSignup.duplicate']).toBe(
    'This email is already registered. Contact support.',
  );
  expect(getMessages('ar')['clientSignup.unavailable']).toBe(
    'يرجى المحاولة مرة أخرى لاحقًا.',
  );
  expect(action + service).not.toMatch(/console\.(?:log|error|warn)\s*\(/);
  expect(results).not.toMatch(/\$\{\s*(?:input|fields|formData)/);
  expect(results).not.toMatch(/return\s+(?:input|fields|formData)\b/);
  expect(service).toMatch(/catch\s*\{/);
});

it('T023 rejects unknown payload fields and maps all database statuses safely', () => {
  const service = source('lib/client-accounts/service.ts');
  const validation = source('lib/client-accounts/validation.ts');
  const results = source('lib/client-accounts/results.ts');

  expect(validation).toContain("['name', 'email', 'phone', 'password']");
  expect(service).toContain('validateSignupFields');
  expect(service).toContain('invalid_input');
  for (const status of [
    'invalid',
    'duplicate',
    'complete',
    'unavailable',
    'invalid_input',
    'sign_out_required',
  ])
    expect(results, `${status} result`).toContain(`'${status}'`);
});

it('T023 provides a production Worker and client-bundle proof for signup keys and test-IP overrides', () => {
  const proof = source('scripts/check-client-signup-edge.mjs');
  const scanner = source('scripts/client-signup-edge-proof.mjs');

  expect(proof, 'build:edge proof script exists').not.toBe('');
  expect(proof).toContain('collectProductionServerOutput');
  expect(proof).toContain('assertSignupServerOutputSafe');
  expect(scanner).toContain('.open-next/worker.js');
  expect(scanner).toContain('.open-next/server-functions');
  expect(scanner).toContain('.open-next/middleware');
  expect(scanner).toContain('client_signup_admit');
  expect(scanner).toContain('ALLOW_SIGNUP_TEST_IP_OVERRIDE');
  expect(scanner).toContain('SIGNUP_TEST_IP');
  expect(scanner).toContain('process');
  expect(scanner).toContain('NODE_ENV');
  expect(proof).toContain('SIGNUP_RATE_KEY');
  expect(proof).toContain('SIGNUP_ATTEST_KEY');
  expect(proof).toContain("name.startsWith('SIGNUP_')");
  expect(proof).toContain('.open-next/assets');
  expect(proof).toContain('.next/static');
});

it('T023 edge proof negative control rejects a live test-IP override in the signup service bundle', async () => {
  const { assertSignupServerOutputSafe } = await import(
    resolve('scripts/client-signup-edge-proof.mjs')
  );
  expect(() =>
    assertSignupServerOutputSafe([
      {
        path: '.open-next/server-functions/default/signup.js',
        contents:
          'client_signup_admit; const mode=process.env.NODE_ENV; if(mode!=="production" && process.env.ALLOW_SIGNUP_TEST_IP_OVERRIDE==="true") process.env.SIGNUP_TEST_IP;',
      },
    ]),
  ).toThrow(/override|production/i);
});

it('T023 edge proof negative control rejects an un-inlined NODE_ENV guard', async () => {
  const { assertSignupServerOutputSafe } = await import(
    resolve('scripts/client-signup-edge-proof.mjs')
  );
  expect(() =>
    assertSignupServerOutputSafe([
      {
        path: '.open-next/server-functions/default/signup.js',
        contents: 'client_signup_admit; const mode=process.env.NODE_ENV;',
      },
    ]),
  ).toThrow(/NODE_ENV|override|production/i);
});

it('T023 edge proof negative control requires the signup service marker', async () => {
  const { assertSignupServerOutputSafe } = await import(
    resolve('scripts/client-signup-edge-proof.mjs')
  );
  expect(() =>
    assertSignupServerOutputSafe([
      {
        path: '.open-next/server-functions/default/signup.js',
        contents: 'export const status = "production";',
      },
    ]),
  ).toThrow(/client_signup_admit|signup service/i);
});

it('U6-R1 negative control accepts only a safe production signup bundle fixture', async () => {
  const { assertSignupServerOutputSafe } = await import(
    resolve('scripts/client-signup-edge-proof.mjs')
  );
  expect(
    assertSignupServerOutputSafe([
      {
        path: '.open-next/server-functions/default/signup.js',
        contents: 'client_signup_admit; const mode="production";',
      },
    ]),
  ).toEqual(['.open-next/server-functions/default/signup.js']);
});

it('U6-R1 negative control rejects an override reference split into another server bundle file', async () => {
  const { assertSignupServerOutputSafe } = await import(
    resolve('scripts/client-signup-edge-proof.mjs')
  );
  expect(() =>
    assertSignupServerOutputSafe([
      {
        path: '.open-next/server-functions/default/signup.js',
        contents: 'client_signup_admit; const mode="production";',
      },
      {
        path: '.open-next/server-functions/default/trusted-ip.js',
        contents: 'const testIp=process.env.SIGNUP_TEST_IP;',
      },
    ]),
  ).toThrow(/override/i);
});

it('U6-R1 returns sign_out_required before admission or signup RPC calls', async () => {
  signupRpcSpy.mockClear();
  const result = await processClientSignup({
    token: 'A'.repeat(43),
    requestSecret: 'B'.repeat(43),
    fields: {
      name: 'Example Person',
      email: 'client@example.test',
      phone: JSON.stringify({ country: 'EG', nationalNumber: '01012345678' }),
      password: 'Complex!2345',
    },
    origin: 'https://signup.example.test',
    expectedOrigin: 'https://signup.example.test',
    headers: { get: () => null },
    signedIn: async () => true,
    locale: 'en',
  });
  expect(result).toEqual({
    status: 'sign_out_required',
    message: 'Please sign out before submitting this registration request.',
  });
  expect(signupRpcSpy).not.toHaveBeenCalled();
});

it('T023 provides the repeatable local SC-011 public-result timing harness', () => {
  const timing = source('scripts/verify-client-signup-timing.mjs');
  expect(timing).toContain("signupResult('duplicate', 'en')");
  expect(timing).toContain('archived-collision-synthetic');
  expect(timing).toContain('200');
  expect(timing).toContain('mannWhitney');
  expect(timing).toContain('Cache-Control: no-store');
  expect(timing).toContain('Referrer-Policy: no-referrer');
});
