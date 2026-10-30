import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const canonical = readFileSync(
  resolve(root, 'specs/015-forms-intake/fixtures/mandatory-intake-copy-ar.md'),
);
const contract = JSON.parse(
  readFileSync(
    resolve(
      root,
      'tests/fixtures/forms/mandatory-intake-copy.test-fixture.json',
    ),
    'utf8',
  ),
) as {
  sha256: string;
  canonicalBase64: string;
  sections: string[];
  excludedMarkers: string[];
};

describe('mandatory intake canonical Arabic copy', () => {
  it('matches the approved canonical bytes without normalization', () => {
    const controlledSource = Buffer.from(contract.canonicalBase64, 'base64');
    const digest = createHash('sha256').update(canonical).digest('hex');
    expect(canonical.equals(controlledSource)).toBe(true);
    expect(digest).toBe(contract.sha256);
  });

  it('contains every canonical section marker in order', () => {
    const copy = canonical.toString('utf8');
    let previous = -1;
    for (const marker of contract.sections) {
      const position = copy.indexOf(marker);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }
  });

  it('keeps PO variation and draft-copy markers outside canonical copy', () => {
    const copy = canonical.toString('utf8');
    for (const marker of contract.excludedMarkers) {
      expect(copy).not.toContain(marker);
    }
  });
});
