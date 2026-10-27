import { cookies } from 'next/headers';
import { getMessages } from '../../../lib/i18n';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
export default async function Loading() {
  const m = getMessages(
    parseLocale((await cookies()).get(LOCALE_COOKIE)?.value),
  );
  return (
    <main>
      <p role="status">{m['registration.loading']}</p>
    </main>
  );
}
