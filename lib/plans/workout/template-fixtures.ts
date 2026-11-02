import type { Locale } from '../../design/preferences';
import type { WorkoutDocument } from './schema';
import type { WorkoutTemplateProjection } from './template-management';

export type WorkoutTemplateFixture = {
  workspaceId: string;
  templates: readonly WorkoutTemplateProjection[];
  draft: WorkoutDocument;
};

const GLOBAL_TEMPLATE_ID = 'a1000000-0000-4000-8000-000000000001';
const WORKSPACE_TEMPLATE_ID = 'a1000000-0000-4000-8000-000000000002';
const RETIRED_TEMPLATE_ID = 'a1000000-0000-4000-8000-000000000003';
const INELIGIBLE_TEMPLATE_ID = 'a1000000-0000-4000-8000-000000000004';

const GLOBAL_DAY_ID = 'b1000000-0000-4000-8000-000000000001';
const WORKSPACE_DAY_ID = 'b1000000-0000-4000-8000-000000000002';
const RETIRED_DAY_ID = 'b1000000-0000-4000-8000-000000000003';
const INELIGIBLE_DAY_ID = 'b1000000-0000-4000-8000-000000000004';

const ITEM_ID = 'c1000000-0000-4000-8000-000000000001';
const SET_ID = 'd1000000-0000-4000-8000-000000000001';

function pushDocument(
  dayId: string,
  title: string,
  notes: string,
): WorkoutDocument {
  return {
    days: [
      {
        id: dayId,
        kind: 'session',
        title,
        notes,
        items: [
          {
            id: ITEM_ID,
            exercise: { source: 'global', id: 'bench-press', version: 1 },
            notes,
            sets: [
              {
                id: SET_ID,
                type: 'working',
                reps: { min: 8, max: 10 },
                load: { mode: 'added_weight', value: '20', unit: 'kg' },
                restSec: 90,
                rir: 2,
              },
            ],
          },
        ],
      },
    ],
  };
}

export function createWorkoutTemplateFixture(
  locale: Locale,
): WorkoutTemplateFixture {
  const workspaceId = 'workspace-a';
  const globalName = locale === 'ar' ? 'قاعدة السكوات' : 'Squat foundation';
  const workspaceName =
    locale === 'ar' ? 'دفع متدرّج' : 'Progressive push';
  const retiredName = locale === 'ar' ? 'دفع قديم' : 'Legacy push';
  const ineligibleName =
    locale === 'ar' ? 'جلسة مرجعية' : 'Reference session';

  return {
    workspaceId,
    draft: { days: [] },
    templates: [
      {
        id: GLOBAL_TEMPLATE_ID,
        scope: 'global',
        name: globalName,
        description:
          locale === 'ar'
            ? 'قالب عام متاح للقراءة فقط.'
            : 'A read-only global template.',
        version: 3,
        status: 'active',
        document: pushDocument(
          GLOBAL_DAY_ID,
          locale === 'ar' ? 'السكوات' : 'Squat day',
          locale === 'ar'
            ? 'تحافظ على العمق الكامل.'
            : 'Keep full depth throughout.',
        ),
        promotionEligible: false,
      },
      {
        id: WORKSPACE_TEMPLATE_ID,
        scope: 'workspace',
        workspaceId,
        name: workspaceName,
        description:
          locale === 'ar'
            ? 'قالب مساحة العمل الخاص.'
            : 'A private workspace template.',
        version: 2,
        status: 'active',
        document: pushDocument(
          WORKSPACE_DAY_ID,
          locale === 'ar' ? 'يوم الدفع' : 'Push day',
          locale === 'ar'
            ? 'تدرّج الحمل أسبوعيًا.'
            : 'Increase load each week.',
        ),
        promotionEligible: true,
      },
      {
        id: RETIRED_TEMPLATE_ID,
        scope: 'workspace',
        workspaceId,
        name: retiredName,
        description:
          locale === 'ar'
            ? 'محفوظ للرجوع إلى الإصدارات السابقة.'
            : 'Retained for historical reference.',
        version: 4,
        status: 'retired',
        document: pushDocument(
          RETIRED_DAY_ID,
          locale === 'ar' ? 'دفع قديم' : 'Legacy push',
          locale === 'ar'
            ? 'لا يمكن تحميل هذا القالب.'
            : 'This template cannot be loaded.',
        ),
        promotionEligible: false,
      },
      {
        id: INELIGIBLE_TEMPLATE_ID,
        scope: 'workspace',
        workspaceId,
        name: ineligibleName,
        description:
          locale === 'ar'
            ? 'يحتوي على ملاحظات خاصة لا يمكن نشره عالميًا.'
            : 'Contains private notes and cannot be promoted.',
        version: 1,
        status: 'active',
        document: pushDocument(
          INELIGIBLE_DAY_ID,
          locale === 'ar' ? 'جلسة مرجعية' : 'Reference session',
          locale === 'ar'
            ? 'ملاحظة خاصة لمساحة العمل.'
            : 'Private workspace note.',
        ),
        promotionEligible: false,
      },
    ],
  };
}
