'use client';
import { useSyncExternalStore } from 'react';
import { parseLocale } from '../../../lib/design/preferences';
const subscribe = () => () => {};
import { getMessages } from '../../../lib/i18n';
export default function ErrorPage() {
  const m = getMessages(
    useSyncExternalStore(
      subscribe,
      () => parseLocale(document.documentElement.lang),
      () => 'ar' as const,
    ),
  );
  return (
    <main>
      <h1>{m['registration.publicInvalid']}</h1>
    </main>
  );
}
