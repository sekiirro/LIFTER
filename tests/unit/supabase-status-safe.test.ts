import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseStatusOutput,
  reportCliError,
  redactSensitiveFields,
  runSupabaseCommand,
  validateAndRedactStatus,
} from '../../scripts/supabase-status-safe.mjs';

const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/supabase-status-fake.json', import.meta.url),
    'utf8',
  ),
);
const expected = {
  workdir: path.resolve('/workspace/LIFTER'),
  projectId: 'lifter',
  apiPort: 54321,
  dbPort: 54322,
  config: { projectId: 'lifter', apiPort: 54321, dbPort: 54322 },
};

describe('safe Supabase status projection', () => {
  it('redacts JWTs, keys, secrets, S3 credentials and the full DB URL', () => {
    const output = JSON.stringify({
      redacted: redactSensitiveFields(fixture),
      safe: validateAndRedactStatus(fixture, expected),
    });

    for (const secret of [
      'fake-anon-jwt',
      'fake-service-role-jwt',
      'fake-jwt-secret',
      'fake-secret-value',
      'fake-s3-key-id',
      'fake-s3-key-secret',
      'fake-password',
      'postgresql://',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('http://127.0.0.1:54321');
    expect(output).toContain('54322');
    expect(output).toContain('lifter');
    expect(validateAndRedactStatus(fixture, expected)).toEqual({
      apiUrl: 'http://127.0.0.1:54321',
      dbPort: 54322,
      projectId: 'lifter',
    });
  });

  it('refuses a relative workdir', () => {
    expect(() =>
      validateAndRedactStatus(fixture, { ...expected, workdir: '.' }),
    ).toThrow(/absolute/i);
  });

  it('refuses a project id that does not match the workdir config', () => {
    expect(() =>
      validateAndRedactStatus(fixture, {
        ...expected,
        projectId: 'another-project',
      }),
    ).toThrow(/project/i);
  });

  it('refuses API or DB ports that do not match the workdir config and status', () => {
    expect(() =>
      validateAndRedactStatus(fixture, { ...expected, apiPort: 25421 }),
    ).toThrow(/port/i);
    expect(() =>
      validateAndRedactStatus(fixture, { ...expected, dbPort: 25422 }),
    ).toThrow(/port/i);
    expect(() =>
      validateAndRedactStatus(
        { ...fixture, API_URL: 'http://127.0.0.1:25421' },
        expected,
      ),
    ).toThrow(/port/i);
    expect(() =>
      validateAndRedactStatus(
        {
          ...fixture,
          DB_URL:
            'postgresql://postgres:fake-password@127.0.0.1:25422/postgres',
        },
        expected,
      ),
    ).toThrow(/port/i);
  });

  it('preserves explicitly supplied default ports in the safe projection', () => {
    const defaultPortStatus = {
      ...fixture,
      API_URL: 'http://127.0.0.1:80',
      DB_URL: 'postgresql://postgres:fake-password@127.0.0.1:5432/postgres',
    };
    expect(
      validateAndRedactStatus(defaultPortStatus, {
        ...expected,
        apiPort: 80,
        dbPort: 5432,
        config: { projectId: 'lifter', apiPort: 80, dbPort: 5432 },
      }),
    ).toEqual({
      apiUrl: 'http://127.0.0.1:80',
      dbPort: 5432,
      projectId: 'lifter',
    });
  });

  it('still rejects API URLs that omit their port', () => {
    expect(() =>
      validateAndRedactStatus(
        { ...fixture, API_URL: 'http://127.0.0.1' },
        expected,
      ),
    ).toThrow('Supabase status API URL has no explicit port');
  });
});

describe('safe Supabase CLI boundary', () => {
  it('does not expose fake credentials from invalid JSON in thrown or printed errors', () => {
    const secret = 'fake-anon-jwt-123';
    const raw = `ANON_KEY=${secret}`;
    let caught: Error | undefined;
    try {
      parseStatusOutput(raw);
    } catch (error) {
      if (error instanceof Error) caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    if (!caught) throw new Error('expected JSON parse failure');
    expect(caught.message).toBe('invalid JSON from Supabase status');
    expect(caught.message).not.toContain(secret);
    expect(reportCliError(caught)).toBe(
      'supabase-status-safe: invalid JSON from Supabase status\n',
    );
    expect(reportCliError(caught)).not.toContain(secret);
  });

  it('prints only a generic line for unexpected errors containing fake secrets', () => {
    const message = reportCliError(new Error('Unexpected fake-anon-jwt-123'));

    expect(message).toBe('supabase-status-safe: failed\n');
    expect(message).not.toContain('fake-anon-jwt-123');
  });

  it.each([
    {
      platform: 'win32',
      workdir: 'C:\\workspace\\LIFTER',
      executable: 'C:\\Program Files\\nodejs\\node.exe',
      npxCliPath:
        'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
      argvPrefix: [
        'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
      ],
    },
    {
      platform: 'posix',
      workdir: '/workspace/LIFTER',
      executable: 'npx',
      npxCliPath: undefined,
      argvPrefix: [],
    },
  ])('passes pinned Supabase arguments as an array on $platform', (setup) => {
    let call:
      { file: string; args: readonly string[]; options: unknown } | undefined;
    const output = runSupabaseCommand(setup.workdir, {
      platform: setup.platform as NodeJS.Platform,
      execPath: 'C:\\Program Files\\nodejs\\node.exe',
      npxCliPath: setup.npxCliPath,
      execFile: ((file: string, args: readonly string[], options: unknown) => {
        call = { file, args, options };
        return '{}';
      }) as never,
    });

    expect(output).toBe('{}');
    if (!call) throw new Error('expected injected exec function to run');
    expect(call.file).toBe(setup.executable);
    expect(call.args).toEqual([
      ...setup.argvPrefix,
      '--yes',
      'supabase@2.122.0',
      'status',
      '-o',
      'json',
      '--workdir',
      setup.workdir,
    ]);
    expect(call.options).toMatchObject({
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  });
});
