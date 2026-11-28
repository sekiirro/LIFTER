import type { MonthlyQualityRevision } from '../../../../lib/workforce/quality-server';
import type { StaffTotal } from '../../../../lib/workforce/report-types';

export const QUALITY_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
export const QUALITY_TRAINER_ID = '22222222-2222-2222-2222-222222222222';
export const QUALITY_ACTOR_ID = '55555555-5555-5555-5555-555555555555';

export const qualityWorkspaces = [
  { id: QUALITY_WORKSPACE_ID, name: 'Workspace A' },
];

export const qualityTrainers: StaffTotal[] = [
  {
    staff_user_id: QUALITY_TRAINER_ID,
    role: 'trainer',
    display_name: 'Trainer A',
    points: '0.00',
    is_negative: false,
  },
  {
    staff_user_id: '77777777-7777-7777-7777-777777777777',
    role: 'trainer',
    display_name: 'Trainer B',
    points: '0.00',
    is_negative: false,
  },
];

const feedback: MonthlyQualityRevision = {
  id: '33333333-3333-3333-3333-333333333333',
  workspace_id: QUALITY_WORKSPACE_ID,
  trainer_id: QUALITY_TRAINER_ID,
  month: '2026-11',
  category: 'feedback',
  revision: 2,
  positive_count: 4,
  negative_count: 1,
  positive_weight: '1.00',
  negative_weight: '-1.00',
  net_points: '3.00',
  idempotency_key: '44444444-4444-4444-4444-444444444444',
  created_at: '2026-11-28T00:00:00Z',
  created_by: QUALITY_ACTOR_ID,
};

export const qualityEffective: MonthlyQualityRevision[] = [
  feedback,
  {
    ...feedback,
    id: '66666666-6666-6666-6666-666666666666',
    category: 'transformation',
    revision: 1,
    negative_count: 0,
    negative_weight: '0.00',
    net_points: '4.00',
  },
];

export const qualityRevisions: MonthlyQualityRevision[] = [
  { ...feedback, id: 'earlier-feedback', revision: 1, positive_count: 2 },
  ...qualityEffective,
];
