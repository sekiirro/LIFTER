import { cookies } from 'next/headers';
import { Skeleton } from '../../../components/ui/States';
import { getMessages } from '../../../lib/i18n';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import styles from './packages.module.css';
export default async function Loading() {
  const store = await cookies();
  const m = getMessages(parseLocale(store.get(LOCALE_COOKIE)?.value));
  return (
    <main className={styles.main} aria-busy="true">
      <p role="status">{m['packages.loading']}</p>
      <Skeleton shape="card" />
    </main>
  );
}
