import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { createSessionClient } from '../../../../lib/supabase/server';
import { getMonthlyQuality } from '../../../../lib/workforce/quality-server';
import {
  cairoCurrentMonth,
  fetchWorkforceReport,
  isValidMonth,
} from '../../../../lib/workforce/report';
import type { StaffTotal } from '../../../../lib/workforce/report-types';
import { MonthlyQualityView } from '../../../../components/workforce/MonthlyQualityView';
import { ToastProvider } from '../../../../components/ui/Toast';
import { recordMonthlyQualityAction } from './actions';

type Search = {
  workspace?: string | string[];
  month?: string | string[];
  trainer?: string | string[];
};

export default async function MonthlyQualityPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const actor = await requireActor();
  if (!actor || actor.role !== 'platform_owner') notFound();
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  const params = await searchParams;
  const month =
    typeof params.month === 'string' && isValidMonth(params.month)
      ? params.month
      : cairoCurrentMonth();

  const client = await createSessionClient();
  if (!client) {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <MonthlyQualityView
          locale={locale}
          messages={messages}
          workspaces={[]}
          trainers={[]}
          workspaceId=""
          trainerId=""
          month={month}
          effective={[]}
          revisions={[]}
          isClosed={false}
          status="error"
          onSave={recordMonthlyQualityAction}
        />
      </ToastProvider>
    );
  }

  const { data: workspaces, error } = await client
    .from('workspaces')
    .select('id,name')
    .order('name');
  if (error) {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <MonthlyQualityView
          locale={locale}
          messages={messages}
          workspaces={[]}
          trainers={[]}
          workspaceId=""
          trainerId=""
          month={month}
          effective={[]}
          revisions={[]}
          isClosed={false}
          status="error"
          onSave={recordMonthlyQualityAction}
        />
      </ToastProvider>
    );
  }
  if (!workspaces || workspaces.length === 0) {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <MonthlyQualityView
          locale={locale}
          messages={messages}
          workspaces={[]}
          trainers={[]}
          workspaceId=""
          trainerId=""
          month={month}
          effective={[]}
          revisions={[]}
          isClosed={false}
          status="empty"
          onSave={recordMonthlyQualityAction}
        />
      </ToastProvider>
    );
  }

  const targetWorkspace = params.workspace;
  if (targetWorkspace !== undefined && typeof targetWorkspace !== 'string')
    notFound();
  const workspaceId =
    typeof targetWorkspace === 'string'
      ? workspaces.find((workspace) => workspace.id === targetWorkspace)?.id
      : workspaces[0]!.id;
  if (!workspaceId) notFound();

  const [report, quality] = await Promise.all([
    fetchWorkforceReport(client, workspaceId, month),
    getMonthlyQuality(workspaceId, month),
  ]);
  if (report.status === 'denied' || quality.status === 'denied') notFound();
  if (report.status === 'error' || quality.status !== 'ok') {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <MonthlyQualityView
          locale={locale}
          messages={messages}
          workspaces={workspaces}
          trainers={[]}
          workspaceId={workspaceId}
          trainerId=""
          month={month}
          effective={[]}
          revisions={[]}
          isClosed={false}
          status="error"
          onSave={recordMonthlyQualityAction}
        />
      </ToastProvider>
    );
  }

  const trainerMap = new Map<string, StaffTotal>(
    report.data.trainers.map((trainer) => [trainer.staff_user_id, trainer]),
  );
  for (const row of [...quality.effective, ...quality.revisions]) {
    if (!trainerMap.has(row.trainer_id)) {
      trainerMap.set(row.trainer_id, {
        staff_user_id: row.trainer_id,
        role: 'trainer',
        display_name: null,
        points: '0.00',
        is_negative: false,
      });
    }
  }
  const trainers = [...trainerMap.values()].sort((a, b) =>
    (a.display_name ?? a.staff_user_id).localeCompare(
      b.display_name ?? b.staff_user_id,
    ),
  );
  if (params.trainer !== undefined && typeof params.trainer !== 'string')
    notFound();
  const targetTrainer =
    typeof params.trainer === 'string' && params.trainer
      ? params.trainer
      : undefined;
  const trainerId =
    typeof targetTrainer === 'string'
      ? trainers.find((trainer) => trainer.staff_user_id === targetTrainer)
          ?.staff_user_id
      : trainers[0]?.staff_user_id;
  if (targetTrainer && !trainerId) notFound();
  if (!trainerId) {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <MonthlyQualityView
          locale={locale}
          messages={messages}
          workspaces={workspaces}
          trainers={[]}
          workspaceId={workspaceId}
          trainerId=""
          month={month}
          effective={quality.effective}
          revisions={quality.revisions}
          isClosed={report.data.is_closed}
          status="empty"
          onSave={recordMonthlyQualityAction}
        />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider dismissLabel={messages['toast.dismiss']}>
      <MonthlyQualityView
        key={`${workspaceId}:${month}:${trainerId}`}
        locale={locale}
        messages={messages}
        workspaces={workspaces}
        trainers={trainers}
        workspaceId={workspaceId}
        trainerId={trainerId}
        month={month}
        effective={quality.effective}
        revisions={quality.revisions}
        isClosed={report.data.is_closed}
        status="ok"
        onSave={recordMonthlyQualityAction}
      />
    </ToastProvider>
  );
}
