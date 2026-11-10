import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkChangedFeatures,
  classifyDocsOnlyPaths,
  gitChangedPaths,
  resolveDiffRange,
  runCiCheck,
  validateSpecConsistency,
} from '../../scripts/spec-consistency.mjs';
import {
  formatCandidatesFromStatus,
  resolveFormatBase,
} from '../../scripts/format-check-changed.mjs';

const BASE_SHA = 'a'.repeat(40);

/** Writes a minimal feature directory; `tasks: null` omits tasks.md. */
function makeFeature(
  root: string,
  name: string,
  options: {
    spec?: string;
    tasks?: string | null;
    traceability?: string;
    analyze?: string;
  } = {},
) {
  const directory = join(root, 'specs', name);
  mkdirSync(join(directory, 'checklists'), { recursive: true });
  writeFileSync(
    join(directory, 'spec.md'),
    options.spec ?? '# Feature\nFR-001\nSC-001',
  );
  if (options.tasks !== null)
    writeFileSync(
      join(directory, 'tasks.md'),
      options.tasks ?? 'T001 [FR-001, SC-001]',
    );
  if (options.traceability)
    writeFileSync(join(directory, 'traceability.md'), options.traceability);
  if (options.analyze)
    writeFileSync(join(directory, 'checklists/analyze.md'), options.analyze);
}

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

  it('matches decided identifiers on token boundaries', () => {
    const files = {
      spec: 'FR-001 SC-001',
      tasks: 'T001 [FR-001, SC-001]',
      traceability: 'FR-001 T001',
      analyze: '# 2026-11-10 S41-PO-10 pending PO',
      decisions: 'S41-PO-1',
      specDate: '2026-11-10',
      planDate: '2026-11-10',
      tasksDate: '2026-11-10',
    };
    expect(validateSpecConsistency(files)).toEqual([]);
    expect(
      validateSpecConsistency({
        ...files,
        analyze: '# 2026-11-10 S41-PO-1 pending PO',
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/S41-PO-1 still marked pending PO/),
      ]),
    );
  });

  it('accepts an ISO datetime Analyze date', () => {
    expect(
      validateSpecConsistency({
        spec: 'FR-001 SC-001',
        tasks: 'T001 [FR-001, SC-001]',
        traceability: 'FR-001 T001',
        analyze: '**Analysis date**: 2026-11-10T22:18Z\nFR-001 T001',
        decisions: '',
        specDate: '2026-11-10',
        planDate: '2026-11-10',
        tasksDate: '2026-11-10',
      }),
    ).toEqual([]);
  });

  it.each([
    ['unknown FR', { tasks: 'T001 [FR-999]' }, 'unknown identifier FR-999'],
    ['unknown SC', { traceability: 'SC-999' }, 'unknown identifier SC-999'],
    [
      'unknown task',
      { analyze: '# 2026-11-09 T999' },
      'unknown identifier T999',
    ],
  ])('rejects %s references', (_label, override, expected) => {
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
    expect(validateSpecConsistency(files)).toEqual(
      expect.arrayContaining([expect.stringContaining(expected)]),
    );
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

describe('changed-feature spec consistency', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spec-consistency-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('checks every touched feature in a multi-feature diff', () => {
    makeFeature(root, '001-alpha');
    makeFeature(root, '002-beta', { tasks: 'T001 [FR-999]' });
    const result = checkChangedFeatures({
      changedPaths: ['specs/001-alpha/spec.md', 'specs/002-beta/tasks.md'],
      root,
      latestCommitDate: () => '2026-11-10',
    });
    expect(result.features).toEqual(['specs/001-alpha', 'specs/002-beta']);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'specs/002-beta: tasks.md: unknown identifier FR-999',
        ),
      ]),
    );
  });

  it('ignores an inconsistent feature that is not in the diff', () => {
    makeFeature(root, '001-alpha');
    makeFeature(root, '002-beta', { tasks: 'T001 [FR-999]' });
    const result = checkChangedFeatures({
      changedPaths: ['specs/001-alpha/tasks.md'],
      root,
      latestCommitDate: () => '2026-11-10',
    });
    expect(result.features).toEqual(['specs/001-alpha']);
    expect(result.errors).toEqual([]);
  });

  it('fails when a touched feature has no tasks.md', () => {
    makeFeature(root, '003-gamma', { tasks: null });
    const result = checkChangedFeatures({
      changedPaths: ['specs/003-gamma/spec.md'],
      root,
      latestCommitDate: () => '2026-11-10',
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('missing tasks.md')]),
    );
  });

  it('checks traceability and Analyze only when present', () => {
    makeFeature(root, '004-delta');
    expect(
      checkChangedFeatures({
        changedPaths: ['specs/004-delta/spec.md'],
        root,
        latestCommitDate: () => '2026-11-10',
      }).errors,
    ).toEqual([]);
    makeFeature(root, '005-epsilon', {
      analyze: '# Analyze 2026-11-09\nT999',
    });
    expect(
      checkChangedFeatures({
        changedPaths: ['specs/005-epsilon/spec.md'],
        root,
        latestCommitDate: () => '2026-11-10',
      }).errors,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('analyze.md: unknown identifier T999'),
      ]),
    );
  });

  it('fails closed when a feature has no commit history date', () => {
    makeFeature(root, '006-zeta');
    const result = checkChangedFeatures({
      changedPaths: ['specs/006-zeta/spec.md'],
      root,
      latestCommitDate: () => {
        throw new Error('no spec/plan/tasks commit history');
      },
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('no spec/plan/tasks')]),
    );
  });
});

describe('changed-path enumeration', () => {
  it('derives the diff range from each event', () => {
    const payload = (value: unknown) => JSON.stringify(value);
    expect(
      resolveDiffRange('pull_request', {
        eventPath: 'event.json',
        readEvent: () => payload({ pull_request: { base: { sha: BASE_SHA } } }),
      }),
    ).toBe(`${BASE_SHA}...HEAD`);
    expect(
      resolveDiffRange('push', {
        eventPath: 'event.json',
        readEvent: () => payload({ before: BASE_SHA }),
      }),
    ).toBe(`${BASE_SHA}...HEAD`);
    expect(
      resolveDiffRange('pull_request', {
        eventPath: 'event.json',
        mergeBase: BASE_SHA,
        readEvent: () =>
          payload({ pull_request: { base: { sha: 'b'.repeat(40) } } }),
      }),
    ).toBe(`${BASE_SHA}...HEAD`);
    expect(resolveDiffRange('workflow_dispatch', {})).toBe('HEAD^1...HEAD');
    expect(() =>
      resolveDiffRange('pull_request', {
        eventPath: 'event.json',
        readEvent: () => 'not json',
      }),
    ).toThrow();
  });

  it('fails closed when the diff cannot be enumerated', () => {
    const result = runCiCheck({
      eventName: 'pull_request',
      root: '.',
      env: { GITHUB_EVENT_PATH: 'event.json' },
      git: () => {
        throw new Error('git diff failed');
      },
      latestCommitDate: () => '2026-11-10',
      readEvent: () =>
        JSON.stringify({ pull_request: { base: { sha: BASE_SHA } } }),
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('changed-path enumeration failed'),
      ]),
    );
  });

  it('includes deleted paths so removed feature documents fail closed', () => {
    let received: string[] = [];
    const paths = gitChangedPaths('HEAD^1...HEAD', (args: string[]) => {
      received = args;
      return 'specs/006-zeta/tasks.md\0';
    });
    expect(paths).toEqual(['specs/006-zeta/tasks.md']);
    expect(received).toContain('--diff-filter=ACDMRTUXB');
  });

  it('rejects an empty path list', () => {
    expect(() => gitChangedPaths('HEAD^1...HEAD', () => '')).toThrow(
      /no changed paths/,
    );
    expect(
      runCiCheck({
        eventName: 'workflow_dispatch',
        root: '.',
        git: () => '',
        latestCommitDate: () => '2026-11-10',
      }).errors,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('changed-path enumeration failed'),
      ]),
    );
  });
});

it('omits deleted Markdown files from changed-file formatting checks', () => {
  expect(
    formatCandidatesFromStatus('D\0removed.md\0M\0changed.yaml\0'),
  ).toEqual(['changed.yaml']);
});

describe('changed-file format base', () => {
  it('prefers the PR merge-ref first parent over the event base', () => {
    const git = (args: string[]) => {
      expect(args).toEqual(['rev-list', '--parents', '-n', '1', 'HEAD']);
      return `mergecommit ${BASE_SHA} ${'d'.repeat(40)}\n`;
    };
    expect(
      resolveFormatBase({
        eventName: 'pull_request',
        envBase: 'c'.repeat(40),
        git,
      }),
    ).toBe(BASE_SHA);
  });

  it('falls back to the provided base without a merge HEAD', () => {
    expect(
      resolveFormatBase({
        eventName: 'pull_request',
        envBase: BASE_SHA,
        git: () => 'singleparent\n',
      }),
    ).toBe(BASE_SHA);
    expect(
      resolveFormatBase({
        eventName: 'push',
        envBase: BASE_SHA,
        git: () => 'singleparent\n',
      }),
    ).toBe(BASE_SHA);
  });

  it('uses HEAD^1 for workflow_dispatch and fails without a base', () => {
    expect(
      resolveFormatBase({
        eventName: 'workflow_dispatch',
        git: (args: string[]) => {
          expect(args).toEqual(['rev-parse', 'HEAD^1']);
          return `${BASE_SHA}\n`;
        },
      }),
    ).toBe(BASE_SHA);
    expect(
      resolveFormatBase({ eventName: undefined, git: () => 'x\n' }),
    ).toBeNull();
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
