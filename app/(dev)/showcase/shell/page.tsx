import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AppShell } from '../../../../components/shell/AppShell';
import { getNavigation } from '../../../../lib/design/navigation';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import { parseDemoRole, RoleSelector } from '../ShellDemo';
import styles from '../showcase.module.css';

export default async function ShellPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string | string[] }>;
}) {
  if (!isShowcaseEnabled(process.env)) notFound();
  const preferences = await cookies();
  const m = getMessages(parseLocale(preferences.get(LOCALE_COOKIE)?.value));
  const role = parseDemoRole((await searchParams).role);
  const navigation = getNavigation(role);
  return (
    <AppShell role={role} activeKey="home" messages={m}>
      <div className={styles.demoContent}>
        <h1>{m['showcase.shell']}</h1>
        <RoleSelector role={role} messages={m} />
        <a className={styles.brandLink} href="/showcase#shell">
          {m['showcase.backToShowcase']}
        </a>
        {navigation.status === 'needs-decision' ? (
          <p data-testid="nav-needs-decision">{m['needsDecision.notice']}</p>
        ) : (
          navigation.items.map((item) => (
            <section key={item.key} id={item.key} className={styles.section}>
              <h2>{m[item.labelKey]}</h2>
              <p>{m['showcase.shellDescription']}</p>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}
