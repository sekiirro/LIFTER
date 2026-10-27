'use client';
import { useSyncExternalStore } from 'react';
import { parseLocale } from '../../../lib/design/preferences';
const subscribe = () => () => {};
import { getMessages } from '../../../lib/i18n';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const m = getMessages(
    useSyncExternalStore(
      subscribe,
      () => parseLocale(document.documentElement.lang),
      () => 'ar' as const,
    ),
  );
  return (
    <main>
      <h1>{m['registration.unavailable']}</h1>
      <button onClick={reset}>{m['registration.reload']}</button>
    </main>
  );
}
