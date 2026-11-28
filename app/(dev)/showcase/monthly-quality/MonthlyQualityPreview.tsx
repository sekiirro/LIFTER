'use client';

import { useState } from 'react';
import type { Locale } from '../../../../lib/design/preferences';
import type { Messages } from '../../../../lib/i18n';
import {
  calculateQualityPoints,
  type QualityPointsParams,
} from '../../../../lib/workforce/quality';
import type {
  MonthlyQualityRevision,
  RecordQualityInput,
  RecordQualityResult,
} from '../../../../lib/workforce/quality-server';
import { MonthlyQualityView } from '../../../../components/workforce/MonthlyQualityView';
import { ToastProvider } from '../../../../components/ui/Toast';
import {
  QUALITY_ACTOR_ID,
  QUALITY_TRAINER_ID,
  QUALITY_WORKSPACE_ID,
  qualityEffective,
  qualityRevisions,
  qualityTrainers,
  qualityWorkspaces,
} from './fixtures';

export function MonthlyQualityPreview({
  locale,
  messages,
}: {
  locale: Locale;
  messages: Messages;
}) {
  const [scope, setScope] = useState({
    workspaceId: QUALITY_WORKSPACE_ID,
    trainerId: QUALITY_TRAINER_ID,
    month: '2026-11',
  });
  async function save(input: RecordQualityInput): Promise<RecordQualityResult> {
    const params: QualityPointsParams = {
      category: input.category,
      positiveCount: input.positiveCount,
      negativeCount: input.negativeCount,
      positiveWeight: input.positiveWeight,
      negativeWeight: input.negativeWeight,
    };
    const points = calculateQualityPoints(params);
    const data: MonthlyQualityRevision = {
      id: crypto.randomUUID(),
      workspace_id: QUALITY_WORKSPACE_ID,
      trainer_id: input.trainerId || QUALITY_TRAINER_ID,
      month: input.month,
      category: input.category,
      revision: input.expectedRevision + 1,
      positive_count: points.positiveCount,
      negative_count: points.negativeCount,
      positive_weight: points.positiveWeight,
      negative_weight: points.negativeWeight,
      net_points: points.netPoints,
      idempotency_key: input.idempotencyKey,
      created_at: new Date().toISOString(),
      created_by: QUALITY_ACTOR_ID,
    };
    return { status: 'ok', data };
  }

  return (
    <ToastProvider dismissLabel={messages['toast.dismiss']}>
      <MonthlyQualityView
        key={`${scope.workspaceId}:${scope.month}:${scope.trainerId}`}
        locale={locale}
        messages={messages}
        workspaces={qualityWorkspaces}
        trainers={qualityTrainers}
        workspaceId={scope.workspaceId}
        trainerId={scope.trainerId || QUALITY_TRAINER_ID}
        month={scope.month}
        effective={qualityEffective.filter(
          (row) =>
            row.workspace_id === scope.workspaceId &&
            row.trainer_id === (scope.trainerId || QUALITY_TRAINER_ID) &&
            row.month === scope.month,
        )}
        revisions={qualityRevisions.filter(
          (row) =>
            row.workspace_id === scope.workspaceId && row.month === scope.month,
        )}
        isClosed={false}
        status="ok"
        initialCategory="feedback"
        onSave={save}
        onScopeChange={setScope}
      />
    </ToastProvider>
  );
}
