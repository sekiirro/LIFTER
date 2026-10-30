import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type TomlValue = string | number | boolean;

function scalar(value: string): TomlValue {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('"') && trimmed.endsWith('"'))
    return trimmed.slice(1, -1);
  return trimmed;
}

function parseProfile(source: string) {
  const values = new Map<string, TomlValue>();
  let section = 'root';
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const header = trimmed.match(/^\[([^\]]+)\]$/);
    if (header) {
      section = header[1]!;
      continue;
    }
    const entry = trimmed.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*$/);
    if (entry) values.set(`${section}.${entry[1]}`, scalar(entry[2]!));
  }
  return values;
}

const identityKeys = [
  'root.project_id',
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
