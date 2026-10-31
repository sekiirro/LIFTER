import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import TOML from '@iarna/toml';

function parseProfile(source: string) {
  const values = new Map<string, unknown>();
  const visit = (value: unknown, prefix: string) => {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      value instanceof Date
    ) {
      values.set(prefix, value);
      return;
    }
    for (const [key, child] of Object.entries(value))
      visit(child, prefix ? `${prefix}.${key}` : key);
  };
  visit(TOML.parse(source), '');
  return values;
}

const identityKeys = [
  'project_id',
  'api.port',
  'db.port',
  'db.shadow_port',
  'studio.port',
  'inbucket.port',
  'inbucket.smtp_port',
  'inbucket.pop3_port',
  'analytics.port',
  'edge_runtime.inspector_port',
  'db.pooler.port',
];

describe('local Supabase profile parity', () => {
  it('compares every value in multiline arrays', () => {
    const root = parseProfile(
      '[auth]\nredirects = [\n  "https://a.test",\n  "https://b.test",\n]\n',
    );
    const stack = parseProfile(
      '[auth]\nredirects = [\n  "https://a.test",\n  "https://c.test",\n]\n',
    );
    expect(Object.fromEntries(root)).not.toEqual(Object.fromEntries(stack));
  });

  it('keeps root CI and Stack B behavior identical outside stack identity', () => {
    const root = parseProfile(readFileSync('supabase/config.toml', 'utf8'));
    const stackB = parseProfile(
      readFileSync('supabase-stack-b/supabase/config.toml', 'utf8'),
    );
    for (const key of identityKeys) {
      root.delete(key);
      stackB.delete(key);
    }
    expect(Object.fromEntries(root)).toEqual(Object.fromEntries(stackB));
  });
});
