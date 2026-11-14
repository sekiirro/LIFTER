import { roleHasCapability } from '../../lib/auth/capabilities';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { requireActor } from '../../lib/auth/actor';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, parseLocale } from '../../lib/design/preferences';
import { SignOutForm } from '../../components/auth/SignOutForm';
import styles from '../login/login.module.css';

export default async function HomePage() {
  const actor = await requireActor();
  const store = await cookies();
  const m = getMessages(parseLocale(store.get(LOCALE_COOKIE)?.value));
  return (
    <main className={styles.main}>
      <h1>{m['auth.signedIn']}</h1>
      {actor.role === 'platform_owner' && (
        <a href="/packages">{m['packages.title']}</a>
      )}
      {actor.role &&
        roleHasCapability(actor.role, 'generate_registration_link') && (
          <a href="/registration-links">{m['registration.title']}</a>
        )}
      {actor.role &&
        roleHasCapability(actor.role, 'approve_registration') &&
        (actor.role === 'platform_owner' ||
          actor.role === 'workspace_owner') && (
          <Link href="/registration-approvals">
            {m['registrationApproval.dashboardApprovals']}
          </Link>
        )}
      {actor.role && roleHasCapability(actor.role, 'record_payment') && (
        <Link href="/payments">
          {m['registrationApproval.dashboardPayments']}
        </Link>
      )}
      {actor.role === null && (
        <Link href="/account/status">
          {m['registrationApproval.clientStatus']}
        </Link>
      )}
      {actor.role && roleHasCapability(actor.role, 'coaching_work') && (
        <Link href="/clients">{m['staff.clientDirectory.title']}</Link>
      )}
      {actor.role === null && (
        <Link href="/plans">{m['client.portal.nav']}</Link>
      )}
      <SignOutForm
        label={m['auth.signOut']}
        failureLabel={m['states.error.description']}
        pendingLabel={m['button.loading']}
      />
    </main>
  );
}
