import type { ReactNode } from 'react';
import { BrandScope } from '../ui/BrandScope';

export function isCurrentWorkspaceResponse(
  requestedWorkspaceId: string | null,
  responseWorkspaceId: string | null,
): boolean {
  return Boolean(
    requestedWorkspaceId &&
    responseWorkspaceId &&
    requestedWorkspaceId === responseWorkspaceId,
  );
}

export function BrandScopeProvider({
  workspaceId,
  responseWorkspaceId,
  color,
  children,
}: {
  workspaceId: string | null;
  responseWorkspaceId: string | null;
  color?: string;
  children: ReactNode;
}) {
  const current = isCurrentWorkspaceResponse(workspaceId, responseWorkspaceId);
  return (
    <BrandScope color={current ? color : undefined}>{children}</BrandScope>
  );
}
