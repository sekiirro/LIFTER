import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import TOML from '@iarna/toml';
import {
  CI_PORT_BASE,
  CI_PORT_KEYS,
  rewriteCiSupabaseConfig,
  selectCiPortMap,
} from '../../scripts/ci-supabase-config.mjs';

describe('self-hosted CI Supabase port map', () => {
  it('selects a contiguous, unique range and rejects invalid bases', () => {
    const map = selectCiPortMap(CI_PORT_BASE);
    expect(Object.values(map)).toEqual(
      Array.from({ length: CI_PORT_KEYS.length }, (_, i) => 56420 + i),
    );
    expect(() => selectCiPortMap(80)).toThrow('Invalid CI Supabase port range');
    expect(() => selectCiPortMap(65530)).toThrow(
      'Invalid CI Supabase port range',
    );
  });

  it('rewrites every configured service port, including shadow and mail ports', () => {
    const source = readFileSync('supabase/config.toml', 'utf8');
    const rewritten = TOML.parse(rewriteCiSupabaseConfig(source));
    expect(rewritten.project_id).toBe('lifter-stack-ci');
    const ports = CI_PORT_KEYS.map(([section, key]) =>
      section
        .split('.')
        .concat(key)
        .reduce<unknown>(
          (value, part) => (value as Record<string, unknown>)[part],
          rewritten,
        ),
    );
    expect(ports).toEqual(Object.values(selectCiPortMap()));
    expect(new Set(ports).size).toBe(CI_PORT_KEYS.length);
    expect(TOML.parse(source).project_id).toBe('lifter');
  });

  it('rejects a source config with the wrong identity or missing service ports', () => {
    expect(() => rewriteCiSupabaseConfig('project_id = "other"\n')).toThrow(
      'Expected the tracked Supabase project id to be lifter',
    );
    expect(() =>
      rewriteCiSupabaseConfig('project_id = "lifter"\n[api]\nenabled = true\n'),
    ).toThrow('does not contain a unique port');
  });
});
