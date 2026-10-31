export function hasWorkspaceDraftEnvelope(
  value: unknown,
  workspaceId: string,
): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'workspaceId' in value &&
    value.workspaceId === workspaceId
  );
}

export function hasWorkspaceDraftResponse(
  value: unknown,
  workspaceId: string,
): boolean {
  return value === null || hasWorkspaceDraftEnvelope(value, workspaceId);
}
