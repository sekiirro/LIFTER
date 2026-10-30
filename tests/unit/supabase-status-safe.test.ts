import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  redactSensitiveFields,
  validateAndRedactStatus,
} from '../../scripts/supabase-status-safe.mjs';

const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/supabase-status-fake.json', import.meta.url),
    'utf8',
  ),
);
const expected = {
  workdir: 'C:\\workspace\\LIFTER',
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
    expect(output).toContain('healthy');
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
});
