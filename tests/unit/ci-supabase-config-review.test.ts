import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import TOML from '@iarna/toml';
import {
  CI_PORT_KEYS,
  rewriteCiSupabaseConfig,
  selectCiPortMap,
  validateCiConfigPortMap,
} from '../../scripts/ci-supabase-config.mjs';

describe('CI Supabase port review regressions', () => {
  it('rewrites a valid TOML underscore integer port', async () => {
    const source = readFileSync('supabase/config.toml', 'utf8').replace(
      /^port = 54321$/m,
      'port = 54_321',
    );
    const rewritten = TOML.parse(await rewriteCiSupabaseConfig(source));
    expect((rewritten.api as Record<string, unknown>).port).toBe(56420);
  });

  it('rejects parsed ports that differ from their mapped values', () => {
    const ports = selectCiPortMap();
    const actual: Record<string, unknown> = {};
    for (const [path, port] of Object.entries(ports)) {
      const keys = path.split('.');
      const leaf = keys.pop()!;
      let section = actual;
      for (const key of keys) {
        section = (section[key] ??= {}) as Record<string, unknown>;
      }
      section[leaf] = port;
    }
    (actual.api as Record<string, unknown>).port = 54321;
    expect(() => validateCiConfigPortMap(actual, ports)).toThrow(
      'does not match its mapped port',
    );
  });

  it('covers every configured key in the map validation fixture', () => {
    expect(Object.keys(selectCiPortMap())).toHaveLength(CI_PORT_KEYS.length);
  });
});
