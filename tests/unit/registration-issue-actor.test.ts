import { describe, expect, it } from 'vitest';
import { registrationIssueActorIndex } from '../e2e/registration-issue-actor';

describe('registration fixture issue actors', () => {
  it('keeps the 29-case hero suite below the 20-issue actor limit', () => {
    const counts = [0, 0];
    for (let issueNumber = 0; issueNumber < 29; issueNumber++) {
      const actorIndex = registrationIssueActorIndex(issueNumber);
      counts[actorIndex] = (counts[actorIndex] ?? 0) + 1;
    }

    expect(counts).toEqual([15, 14]);
    expect(Math.max(...counts)).toBeLessThanOrEqual(20);
  });
});
