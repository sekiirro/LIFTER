'use client';

import { signOut } from '../../app/(app)/actions';
import { Button } from '../ui/Button';

const CLIENT_NOTES_PENDING_PREFIX = 'lifter-client-notes-pending-create:v1:';

export function SignOutForm({ label }: { label: string }) {
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

  return (
    <form action={signOut} onSubmit={clearPendingClientNotes}>
      <Button type="submit">{label}</Button>
    </form>
  );
}
