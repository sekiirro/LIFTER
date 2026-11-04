import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';
import { getTestCookieOrigin } from '../e2e/test-origin.mjs';

const e2eRoot = join(process.cwd(), 'tests/e2e');

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

function isOriginHelperExpression(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  seen = new Set<string>(),
): boolean {
  if (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'getTestCookieOrigin'
  ) {
    return true;
  }

  if (!ts.isIdentifier(expression) || seen.has(expression.text)) return false;
  const declarations: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === expression.text &&
      node.initializer
    ) {
      declarations.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const nextSeen = new Set(seen).add(expression.text);
  return (
    declarations.length > 0 &&
    declarations.every(
      ({ initializer }) =>
        initializer &&
        isOriginHelperExpression(initializer, sourceFile, nextSeen),
    )
  );
}

function unsafeCookieUrlAssignments() {
  const unsafe: string[] = [];
  for (const path of typescriptFiles(e2eRoot)) {
    const source = readFileSync(path, 'utf8');
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && node.name.getText(sourceFile) === 'url') {
        if (!isOriginHelperExpression(node.initializer, sourceFile)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          unsafe.push(`${relative(e2eRoot, path).replaceAll('\\', '/')}:${line + 1}`);
        }
      } else if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'url') {
        if (!isOriginHelperExpression(node.name, sourceFile)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          unsafe.push(`${relative(e2eRoot, path).replaceAll('\\', '/')}:${line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return unsafe;
}

describe('getTestCookieOrigin', () => {
  it('uses the origin when the base URL contains a path', () => {
    expect(getTestCookieOrigin('http://localhost:3000/nested/')).toBe(
      'http://localhost:3000',
    );
  });

  it('uses an origin-only value for every E2E cookie URL', () => {
    expect(unsafeCookieUrlAssignments()).toEqual([]);
  });
});
