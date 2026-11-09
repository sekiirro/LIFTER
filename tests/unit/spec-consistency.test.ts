import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  classifyDocsOnlyPaths,
  validateSpecConsistency,
} from '../../scripts/spec-consistency.mjs';

describe('spec consistency validation', () => {
  it('accepts complete identifiers and a current Analyze date', () => {
    const files = {
      spec: '# Feature\nFR-001\nSC-001',
      plan: '2026-11-09',
      tasks: 'T001 [FR-001, SC-001]',
      traceability: 'FR-001 → T001 → tests/unit/example.test.ts',
      analyze: '# Analyze 2026-11-09\nFR-001 SC-001 T001',
      decisions: 'S41-PO-10 decided',
      specDate: '2026-11-09',
      planDate: '2026-11-09',
      tasksDate: '2026-11-09',
    };
    expect(validateSpecConsistency(files)).toEqual([]);
  });

  it.each([
    ['unknown FR', { tasks: 'T001 [FR-999]' }],
    ['unknown SC', { traceability: 'SC-999' }],
    ['unknown task', { analyze: 'T999' }],
  ])('rejects %s references', (_label, override) => {
    const files = {
      spec: 'FR-001 SC-001',
      plan: '2026-11-09',
      tasks: 'T001 [FR-001, SC-001]',
      traceability: 'FR-001 T001',
      analyze: '# 2026-11-09',
      decisions: '',
      specDate: '2026-11-09',
      planDate: '2026-11-09',
      tasksDate: '2026-11-09',
      ...override,
    };
    expect(validateSpecConsistency(files).length).toBeGreaterThan(0);
  });

  it('rejects stale Analyze dates and decided pending PO markers', () => {
    expect(
      validateSpecConsistency({
        spec: 'FR-001 SC-001',
        plan: '2026-11-09',
        tasks: 'T001 FR-001',
        traceability: 'FR-001 T001',
        analyze: '# 2026-11-08 FR-001',
        decisions: 'S41-PO-10',
        specDate: '2026-11-09',
        planDate: '2026-11-09',
        tasksDate: '2026-11-09',
      }),
    ).toEqual(
      expect.arrayContaining([expect.stringMatching(/Analyze.*date/i)]),
    );
    expect(
      validateSpecConsistency({
        spec: 'FR-001 SC-001',
        plan: '2026-11-09',
        tasks: 'T001 FR-001',
        traceability: 'FR-001 T001',
        analyze: '# 2026-11-09 S41-PO-10 pending PO',
        decisions: 'S41-PO-10',
        specDate: '2026-11-09',
        planDate: '2026-11-09',
        tasksDate: '2026-11-09',
      }),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/pending PO/i)]));
  });
});

describe('docs-only classification', () => {
  it.each([
    ['docs/guide.md', true],
    ['specs/001/plan.md', true],
    ['.specify/memory/constitution.md', true],
    ['README.md', true],
    ['CHANGELOG.md', true],
    ['.github/workflows/ci.yml', false],
    ['docs/guide.MD', false],
    ['docs/guide.txt', false],
    [' docs/guide.md', false],
    ['docs/guide.md ', false],
    ['docs/nested/../../src/app.ts', false],
  ])('%s → docsOnly=%s', (path, expected) => {
    expect(classifyDocsOnlyPaths([path])).toBe(expected);
  });

  it.each([
    [['docs/a.md', 'src/a.ts'], false],
    [['docs/a.md\0src/a.ts'], false], // rename source and destination are both checked
    [[], false],
  ])(
    'classifies multiple or empty path lists fail-closed',
    (paths, expected) => {
      expect(classifyDocsOnlyPaths(paths)).toBe(expected);
    },
  );

  it('classifies diff detection errors as full CI', () => {
    expect(classifyDocsOnlyPaths(null)).toBe(false);
  });
});

it('CodeRabbit filters exclude generated evidence without excluding authored paths', () => {
  const config = readFileSync('.coderabbit.yaml', 'utf8');
  expect(config).toContain('!specs/**/reports/**');
  expect(config).toContain('!**/*.log');
  expect(config).toContain('!**/gate-*.json');
  for (const broadFilter of [
    '!specs/**',
    '!docs/**',
    '!src/**',
    '!tests/**',
    '!supabase/migrations/**',
    '!.github/workflows/**',
  ])
    expect(config).not.toContain(`- '${broadFilter}'`);
});
