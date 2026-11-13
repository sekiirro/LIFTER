'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { signOut } from '../../app/(app)/actions';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

const CLIENT_NOTES_PENDING_PREFIX = 'lifter-client-notes-pending-create:v1:';

export function SignOutForm({
  label,
  failureLabel,
  pendingLabel,
}: {
  label: string;
  failureLabel: string;
  pendingLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const clearPendingClientNotes = () => {
    try {
      const keys = Array.from(
        { length: window.sessionStorage.length },
        (_, i) => window.sessionStorage.key(i),
      );
      for (const key of keys) {
        if (key?.startsWith(CLIENT_NOTES_PENDING_PREFIX))
          window.sessionStorage.removeItem(key);
      }
    } catch {
      // Signing out must continue even when browser storage is unavailable.
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFailed(false);
    startTransition(async () => {
      try {
        if (!(await signOut())) {
          setFailed(true);
          return;
        }
        clearPendingClientNotes();
        router.replace('/login');
      } catch {
        // Keep the pending note recovery when sign-out cannot be confirmed.
        setFailed(true);
      }
    });
  };

  return (
    <form onSubmit={submit}>
      {failed && <Alert tone="error" title={failureLabel} />}
      <Button
        type="submit"
        disabled={pending}
        loading={pending}
        loadingLabel={pendingLabel}
      >
        {label}
      </Button>
    </form>
  );
}
