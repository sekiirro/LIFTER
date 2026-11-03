export function registrationIssueActorIndex(
  issueNumber: number,
  actorCount = 2,
): number {
  if (!Number.isInteger(issueNumber) || issueNumber < 0)
    throw new RangeError('issueNumber must be a non-negative integer');
  if (!Number.isInteger(actorCount) || actorCount < 1)
    throw new RangeError('actorCount must be a positive integer');
  return issueNumber % actorCount;
}
