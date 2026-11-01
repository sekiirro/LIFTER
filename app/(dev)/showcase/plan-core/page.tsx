import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { PlanLifecycleControls } from '../../../../components/plan-core/PlanLifecycleControls';
import { FirstDeliveryStatus } from '../../../../components/plan-core/FirstDeliveryStatus';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import { WORKOUT_FIRST_DELIVERY_FIXTURE } from '../../../../lib/plan-core/delivery-contract';
import styles from './page.module.css';

const planId = '123e4567-e89b-12d3-a456-426614174000';

export default async function PlanCoreShowcasePage() {
  if (!isShowcaseEnabled(process.env)) notFound();
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  return (
    <main className={styles.page} data-testid="plan-core-showcase">
      <h1>{m['planCore.title']}</h1>
      <PlanLifecycleControls
        locale={locale}
        planId={planId}
        projection={{ planId, readiness: 'published' }}
        messages={m}
      />
      <FirstDeliveryStatus
        locale={locale}
        subscriptionId={WORKOUT_FIRST_DELIVERY_FIXTURE.subscriptionId}
        deliveries={[WORKOUT_FIRST_DELIVERY_FIXTURE]}
        activation={null}
        messages={m}
      />
    </main>
  );
}
