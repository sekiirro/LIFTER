import { cookies } from 'next/headers';
import { requireActor } from '../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { ToastProvider } from '../../../components/ui/Toast';
import { getEligibleEmployees } from '../../../lib/workforce/payroll';
import { PayrollManager } from '../../../components/payroll/PayrollManager';

function cairoMonth() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

export default async function PayrollPage() {
  const actor = await requireActor();
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);

  // Platform Owner only for payroll management screens
  if (actor.role !== 'platform_owner') {
    return (
      <ToastProvider dismissLabel={messages['dialog.cancel']}>
        <PayrollManager
          locale={locale}
          messages={messages}
          initialEmployees={[]}
          initialMonth={cairoMonth()}
          denied={true}
        />
      </ToastProvider>
    );
  }

  const result = await getEligibleEmployees();
  const employees = result.status === 'ok' ? result.employees : [];

  return (
    <ToastProvider dismissLabel={messages['dialog.cancel']}>
      <PayrollManager
        locale={locale}
        messages={messages}
        initialEmployees={employees}
        initialMonth={cairoMonth()}
        denied={false}
      />
    </ToastProvider>
  );
}
