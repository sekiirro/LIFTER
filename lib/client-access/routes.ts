const assignmentDestinationPattern =
  /^\/forms\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type ApprovedClientDestination = '/' | `/forms/${string}`;

/** F12 post-approval destinations are fixed routes or a canonical assignment UUID. */
export function isApprovedClientDestination(
  value: unknown,
): value is ApprovedClientDestination {
  return (
    value === '/' ||
    (typeof value === 'string' && assignmentDestinationPattern.test(value))
  );
}

export function approvedAssignmentDestination(
  assignmentId: unknown,
): ApprovedClientDestination | null {
  if (
    typeof assignmentId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      assignmentId,
    )
  )
    return null;
  return `/forms/${assignmentId}`;
}
