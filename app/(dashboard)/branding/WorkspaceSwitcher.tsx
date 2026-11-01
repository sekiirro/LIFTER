'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../components/ui/Button';
import type { Locale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { hasWorkspaceDraftResponse } from '../../../lib/branding/workspace-response';
import styles from './branding.module.css';

export function WorkspaceSwitcher({
  locale,
  selected,
  workspaces,
}: {
  locale: Locale;
  selected: string;
  workspaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const messages = getMessages(locale);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const lastRequestedWorkspace = useRef(selected);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [requestedWorkspace, setRequestedWorkspace] = useState(selected);

  async function switchWorkspace(workspaceId: string) {
    lastRequestedWorkspace.current = workspaceId;
    controller.current?.abort();
    const currentId = ++requestId.current;
    const nextController = new AbortController();
    controller.current = nextController;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/branding/draft?workspace=${encodeURIComponent(workspaceId)}`,
        {
          signal: nextController.signal,
          cache: 'no-store',
        },
      );
      const draft: unknown = await response.json();
      if (currentId !== requestId.current || nextController.signal.aborted)
        return;
      if (!response.ok || !hasWorkspaceDraftResponse(draft, workspaceId)) {
        setFailed(true);
        setPending(false);
        setRequestedWorkspace(selected);
        return;
      }
      setRequestedWorkspace(workspaceId);
      setPending(false);
      router.replace(`/branding?workspace=${encodeURIComponent(workspaceId)}`);
      router.refresh();
    } catch {
      if (nextController.signal.aborted || currentId !== requestId.current)
        return;
      setFailed(true);
      setPending(false);
      setRequestedWorkspace(selected);
    }
  }

  return (
    <div className={styles.workspace} data-workspace-switcher="">
      <label htmlFor="branding-workspace">
        {messages['registrationApproval.workspace']}
      </label>
      <select
        id="branding-workspace"
        value={requestedWorkspace}
        onChange={(event) => {
          setRequestedWorkspace(event.target.value);
          void switchWorkspace(event.target.value);
        }}
        aria-describedby={failed ? 'branding-workspace-error' : undefined}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      {pending && (
        <span role="status">{messages['branding.workspaceLoading']}</span>
      )}
      {failed && (
        <span id="branding-workspace-error" role="alert">
          {messages['branding.genericUnavailable']}
        </span>
      )}
      {failed && (
        <Button
          type="button"
          disabled={pending}
          onClick={() => void switchWorkspace(lastRequestedWorkspace.current)}
        >
          {messages['registrationApproval.retry']}
        </Button>
      )}
    </div>
  );
}
