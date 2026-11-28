'use client';

import { useRouter } from 'next/navigation';
import {
  directoryHref,
  type DirectoryQuery,
} from '../../../lib/client-directory/query';

type DirectoryWorkspace = { id: string; name: string };
type DirectoryRouter = { push: (href: string) => void };

export function navigateDirectoryWorkspace(
  router: DirectoryRouter,
  workspaceId: string,
  query: DirectoryQuery,
) {
  router.push(directoryHref(workspaceId, query, query.page));
}

export function DirectoryWorkspaceSelector({
  workspaceId,
  workspaces,
  query,
}: {
  workspaceId: string;
  workspaces: DirectoryWorkspace[];
  query: DirectoryQuery;
}) {
  const router = useRouter();

  return (
    <select
      id="directory-workspace"
      name="workspace"
      value={workspaceId}
      onChange={(event) =>
        navigateDirectoryWorkspace(router, event.currentTarget.value, query)
      }
    >
      {workspaces.map((workspace) => (
        <option key={workspace.id} value={workspace.id}>
          {workspace.name}
        </option>
      ))}
    </select>
  );
}
