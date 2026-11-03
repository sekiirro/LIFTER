export function registrationIssueActorIndex(issueNumber: number): 0 | 1 {
  return issueNumber % 2 === 0 ? 0 : 1;
}
