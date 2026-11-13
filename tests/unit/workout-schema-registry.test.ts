import { describe, expect, it } from 'vitest';
import { createSchemaRegistry } from '../../lib/workout-planner/schema-registry';

// T010-note: FR-022 schema registry fail-closed. Registered immutable
// parsers; unknown version fails generically; retained versions render.
// RED first. Mutation target: deleting the fail-closed branch must fail.

describe('F17 schema registry fail-closed (FR-022)', () => {
  it('parses registered versions and rejects unknown versions generically', () => {
    const registry = createSchemaRegistry();
    registry.register(1, (doc) => ({ parsed: 'v1', doc }));
    const ok = registry.parse({ schema_version: 1, days: [] });
    expect(ok.ok).toBe(true);

    const unknown2 = registry.parse({ schema_version: 2, days: [] });
    const unknown99 = registry.parse({ schema_version: 99, days: [] });
    expect(unknown2).toEqual({ ok: false, code: 'unknown_schema' });
    // Generic: every unknown version yields the identical failure.
    expect(unknown99).toEqual(unknown2);
  });

  it('keeps parsers immutable: re-registration never replaces the original', () => {
    const registry = createSchemaRegistry();
    registry.register(1, () => 'original');
    expect(() => registry.register(1, () => 'replacement')).toThrow();
    expect(registry.parse({ schema_version: 1 })).toEqual({
      ok: true,
      value: 'original',
    });
  });

  it('renders retained versions after newer ones are added', () => {
    const registry = createSchemaRegistry();
    registry.register(1, (doc) => ({ parsed: 'v1', doc }));
    registry.register(2, (doc) => ({ parsed: 'v2', doc }));
    expect(registry.parse({ schema_version: 1 }).ok).toBe(true);
    expect(registry.parse({ schema_version: 2 }).ok).toBe(true);
  });

  it('fails closed on missing or non-integer schema versions', () => {
    const registry = createSchemaRegistry();
    registry.register(1, (doc) => doc);
    expect(registry.parse({ days: [] })).toEqual({
      ok: false,
      code: 'unknown_schema',
    });
    expect(registry.parse({ schema_version: '1' })).toEqual({
      ok: false,
      code: 'unknown_schema',
    });
  });
});
