import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const contractPath = resolve(
  process.cwd(),
  'specs/016-exercise-food-catalogs/contracts/catalog-api.md',
);
const sqlFixturePath = resolve(
  process.cwd(),
  'tests/fixtures/catalog-role-parity.sql.json',
);

type MatrixRow = Record<string, string> & { operation: string };

function contractExpectationFixture(): {
  roles: string[];
  operations: MatrixRow[];
} {
  const markdown = readFileSync(contractPath, 'utf8');
  const table = markdown.match(
    /\|\s*Operation\s*\|\s*PO\s*\|\s*WO\s*\|\s*Trainer\s*\|\s*Sales\s*\|\s*Client\s*\|\s*Unknown\/unauthenticated\s*\|\r?\n\|[^\n]+\|\r?\n((?:\|[^\n]+\|\r?\n)+)/,
  );
  if (!table)
    throw new Error('Role authorization matrix missing from contract');
  const matrixBody = table[1];
  if (!matrixBody) throw new Error('Role authorization matrix is empty');
  const headers = [
    'operation',
    'PO',
    'WO',
    'Trainer',
    'Sales',
    'Client',
    'Unknown/unauthenticated',
  ];
  const operations = matrixBody
    .trim()
    .split(/\r?\n/)
    .map(
      (line) =>
        Object.fromEntries(
          line
            .slice(1, -1)
            .split('|')
            .map((cell, index) => [
              headers[index],
              cell.trim().replaceAll('`', ''),
            ]),
        ) as MatrixRow,
    );
  return { roles: headers.slice(1), operations };
}

function assertParity(
  expected: ReturnType<typeof contractExpectationFixture>,
  sql: ReturnType<typeof contractExpectationFixture>,
) {
  expect(sql.roles).toEqual(expected.roles);
  expect(sql.operations).toEqual(expected.operations);
}

describe('catalog TypeScript and SQL role parity fixture', () => {
  it('matches every role and operation in the documented authorization matrix', () => {
    const expected = contractExpectationFixture();
    const sql = JSON.parse(readFileSync(sqlFixturePath, 'utf8')) as ReturnType<
      typeof contractExpectationFixture
    >;
    sql.operations = sql.operations.map(
      (row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            value.replaceAll('`', ''),
          ]),
        ) as MatrixRow,
    );

    expect(expected.roles).toEqual([
      'PO',
      'WO',
      'Trainer',
      'Sales',
      'Client',
      'Unknown/unauthenticated',
    ]);
    expect(expected.operations).toHaveLength(13);
    assertParity(expected, sql);
  });
  it('fails when any role permission is changed or removed from the SQL fixture', () => {
    const expected = contractExpectationFixture();
    const baseline = JSON.parse(
      readFileSync(sqlFixturePath, 'utf8'),
    ) as ReturnType<typeof contractExpectationFixture>;
    for (const role of expected.roles) {
      const changed = structuredClone(baseline);
      const changedRow = changed.operations[0];
      if (!changedRow) throw new Error('Role matrix is empty');
      changedRow[role] = 'Mutated permission';
      expect(
        () => assertParity(expected, changed),
        `${role} changed`,
      ).toThrow();

      const removed = structuredClone(baseline);
      const removedRow = removed.operations[0];
      if (!removedRow) throw new Error('Role matrix is empty');
      delete removedRow[role];
      expect(
        () => assertParity(expected, removed),
        `${role} removed`,
      ).toThrow();
    }
  });
});
