'use client';

import { useRouter } from 'next/navigation';
import { useTransition, type FormEvent } from 'react';
import { signOut } from '../../app/(app)/actions';
import { Button } from '../ui/Button';

const CLIENT_NOTES_PENDING_PREFIX = 'lifter-client-notes-pending-create:v1:';

export function SignOutForm({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
    startTransition(async () => {
      try {
        if (!(await signOut())) return;
        clearPendingClientNotes();
        router.replace('/login');
      } catch {
        // Keep the pending note recovery when sign-out cannot be confirmed.
      }
    });
  };

  return (
    <form onSubmit={submit}>
      <Button type="submit" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}
