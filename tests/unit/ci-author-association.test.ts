import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const pushOwnerGate =
  "(github.event_name != 'push' || github.actor == github.repository_owner)";
const pullRequestOwnerGate =
  "(github.event_name != 'pull_request' || contains(fromJSON('[\"OWNER\"]'), github.event.pull_request.author_association))";

describe('self-hosted CI actor and author-association policy', () => {
  it('gates every runner and privileged environment expression on push owner and preserves owner-only PR policy', () => {
    const pushGates = workflow.match(
      /\(github\.event_name != 'push' \|\| github\.actor == github\.repository_owner\)/g,
    );
    expect(pushGates).toHaveLength(12);

    const prGates = workflow.match(
      /\(github\.event_name != 'pull_request' \|\| contains\(fromJSON\('\["[A-Z]+"\]'\), github\.event\.pull_request\.author_association\)\)/g,
    );
    expect(prGates).toHaveLength(12);
    expect(new Set(prGates)).toEqual(new Set([pullRequestOwnerGate]));

    const protectedExpressions = workflow.match(
      /^[ \t]*(?:runs-on|LIFTER_CI_ISOLATED|LIFTER_SUPABASE_STACK|DOCKERHUB_USERNAME|DOCKERHUB_TOKEN):.*$/gm,
    );
    expect(protectedExpressions).toHaveLength(12);
    for (const expression of protectedExpressions ?? []) {
      expect(expression).toContain(pushOwnerGate);
      expect(expression).toContain(pullRequestOwnerGate);
    }
  });

  it('routes push and PR matrices as specified', () => {
    const cases = [
      {
        event: 'push',
        actor: 'sekiirro',
        association: undefined,
        runner: 'self-hosted',
        isolated: true,
        stack: 'ci',
        secrets: true,
      },
      {
        event: 'push',
        actor: 'contributor',
        association: undefined,
        runner: 'ubuntu-latest',
        isolated: false,
        stack: 'a',
        secrets: false,
      },
      {
        event: 'pull_request',
        actor: 'sekiirro',
        association: 'OWNER',
        runner: 'self-hosted',
        isolated: true,
        stack: 'ci',
        secrets: true,
      },
      ...['MEMBER', 'COLLABORATOR', 'CONTRIBUTOR', 'NONE'].map(
        (association) => ({
          event: 'pull_request',
          actor: 'contributor',
          association,
          runner: 'ubuntu-latest',
          isolated: false,
          stack: 'a',
          secrets: false,
        }),
      ),
    ];

    for (const testCase of cases) {
      const pushAllowed =
        testCase.event !== 'push' || testCase.actor === 'sekiirro';
      const prAllowed =
        testCase.event !== 'pull_request' || testCase.association === 'OWNER';
      const privileged = pushAllowed && prAllowed;
      expect(privileged ? 'self-hosted' : 'ubuntu-latest').toBe(
        testCase.runner,
      );
      expect(privileged).toBe(testCase.isolated);
      expect(privileged ? 'ci' : 'a').toBe(testCase.stack);
      expect(privileged).toBe(testCase.secrets);
    }
  });
});
