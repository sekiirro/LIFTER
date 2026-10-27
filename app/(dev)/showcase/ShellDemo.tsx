import { AppShell } from '../../../components/shell/AppShell';
import type { Messages } from '../../../lib/i18n';
import styles from './showcase.module.css';

export type DemoRole = 'trainer' | 'client' | 'sales';
export function parseDemoRole(value: string | string[] | undefined): DemoRole {
  return value === 'client' || value === 'sales' ? value : 'trainer';
}

export function RoleSelector({
  role,
  messages: m,
  preview = false,
}: {
  role: DemoRole;
  messages: Messages;
  preview?: boolean;
}) {
  return (
    <div role="group" aria-label={m['showcase.role']} className={styles.row}>
      {(['trainer', 'client', 'sales'] as const).map((option) => (
        <a
          key={option}
          href={`?role=${option}${preview ? '#shell' : ''}`}
          className={styles.roleLink}
          aria-current={role === option ? 'page' : undefined}
          data-testid={`role-${option}`}
        >
          {m[`showcase.${option}`]}
        </a>
      ))}
    </div>
  );
}

export function ShellDemo({
  role,
  messages: m,
}: {
  role: DemoRole;
  messages: Messages;
}) {
  return (
    <section
      id="shell"
      aria-labelledby="shell-title"
      className={styles.section}
    >
      <h2 id="shell-title">{m['showcase.shell']}</h2>
      <RoleSelector role={role} messages={m} preview />
      <div className={styles.previewFrame}>
        <div className={styles.previewScale}>
          <AppShell
            role={role}
            activeKey="home"
            messages={m}
            contentAs="div"
            hrefFor={(key) => `?role=${role}#${key}`}
          >
            <div className={styles.demoContent}>
              <h3>{m['nav.home']}</h3>
              <p>{m['showcase.shellDescription']}</p>
              {role === 'sales' && (
                <p data-testid="nav-needs-decision">
                  {m['needsDecision.notice']}
                </p>
              )}
            </div>
          </AppShell>
        </div>
      </div>
      <p>{m['showcase.shellLinks']}</p>
      <ul className={styles.demoLinks}>
        {(['trainer', 'client', 'sales'] as const).map((option) => (
          <li key={option}>
            <a
              className={styles.brandLink}
              href={`/showcase/shell?role=${option}`}
            >
              {m[`showcase.${option}`]}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
