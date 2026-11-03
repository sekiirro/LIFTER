import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('self-hosted CI author association policy', () => {
  it('uses the exact OWNER-only gate for runner selection, isolation, stack, and secrets', () => {
    const gates = workflow.match(
      /contains\(fromJSON\('\[(?:"[A-Z]+"(?:,"[A-Z]+")*)?\]'\), github\.event\.pull_request\.author_association\)/g,
    );

    expect(gates).toHaveLength(12);
    expect(new Set(gates)).toEqual(
      new Set([
        `contains(fromJSON('["OWNER"]'), github.event.pull_request.author_association)`,
      ]),
    );

    const allowed = new Set(['OWNER']);
    for (const association of [
      'OWNER',
      'MEMBER',
      'COLLABORATOR',
      'CONTRIBUTOR',
      'NONE',
    ]) {
      const isOwner = allowed.has(association);
      expect(isOwner).toBe(association === 'OWNER');
      expect(isOwner ? 'self-hosted' : 'ubuntu-latest').toBe(
        association === 'OWNER' ? 'self-hosted' : 'ubuntu-latest',
      );
      expect(isOwner ? 'secrets-available' : '').toBe(
        association === 'OWNER' ? 'secrets-available' : '',
      );
    }
  });
});
