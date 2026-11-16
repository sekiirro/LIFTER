// F17 T052 design-gate fixtures: merged-UI samples only (FR-024; SC-013).
//
// Every string a component renders comes from PO-approved
// `lib/i18n/messages` via the component itself; this module holds only
// structural fixture data (ids, counts, synthetic names) and no UI copy.

import type { AlternativeCandidate } from '../../../../components/workout-planner/AlternativesEditor';
import type { AssignReceiptItem } from '../../../../components/workout-planner/TemplateAssignWizard';
import type { TemplateSummary } from '../../../../components/workout-planner/TemplateManager';
import type { WorkoutExportPayload } from '../../../../lib/workout-planner/export-payload';
import type { EntryPrescriptions } from '../../../../lib/workout-planner/entry-prescriptions';
import type {
  MuscleMembership,
  VolumeDay,
} from '../../../../lib/workout-planner/volume';
import type { WorkoutExerciseReference } from '../../../../lib/workout-planner/document';
import { alternativeKey } from '../../../../lib/workout-planner/alternatives';

export const F17_TEMPLATES: TemplateSummary[] = [
  {
    id: 'gate-global-1',
    name: 'Global Strength',
    scope: 'global',
    version: 2,
    retired: false,
  },
  {
    id: 'gate-own-1',
    name: 'Kendo Power',
    scope: 'own',
    version: 1,
    retired: false,
  },
  {
    id: 'gate-assigned-1',
    name: 'Kendo Copy of Global Strength',
    scope: 'assigned',
    version: 1,
    retired: false,
    originName: 'Global Strength',
    originVersion: 2,
  },
  {
    id: 'gate-assigned-2',
    name: 'Old Assigned Copy',
    scope: 'assigned',
    version: 3,
    retired: true,
    originName: 'Global Strength',
    originVersion: 1,
  },
];

export const F17_WIZARD_TEMPLATES = [
  { id: 'gate-global-1', name: 'Global Strength', retired: false },
  { id: 'gate-global-2', name: 'Old Global Base', retired: true },
];

export const F17_WIZARD_WORKSPACES = [
  { id: 'ws-kendo', name: 'Kendo' },
  { id: 'ws-alpha', name: 'Alpha' },
  { id: 'ws-beta', name: 'Beta' },
];

export const F17_RECEIPT: AssignReceiptItem[] = [
  {
    workspaceId: 'ws-kendo',
    workspaceName: 'Kendo',
    outcome: 'assigned',
    copiedTemplateIds: ['gate-global-1'],
    skippedTemplateIds: [],
  },
  {
    workspaceId: 'ws-alpha',
    workspaceName: 'Alpha',
    outcome: 'skipped_already_assigned',
    copiedTemplateIds: [],
    skippedTemplateIds: ['gate-global-1'],
  },
  {
    workspaceId: 'ws-beta',
    workspaceName: 'Beta',
    outcome: 'no_copies',
    copiedTemplateIds: [],
    skippedTemplateIds: [],
  },
];

export const F17_PRESCRIPTION_FIXED: EntryPrescriptions = {
  reps: { value: 10 },
  restSec: 120,
  rir: 2,
  notes: 'Pause 1s at the bottom',
};

export const F17_PRESCRIPTION_RANGE: EntryPrescriptions = {
  reps: { min: 8, max: 12 },
  restSec: 90,
  rir: 1,
};

const ALT_ACTIVE: WorkoutExerciseReference = {
  source: 'global',
  identity_id: '22222222-2222-4222-8222-222222222222',
  version: 1,
};
const ALT_REMOVED: WorkoutExerciseReference = {
  source: 'global',
  identity_id: '33333333-3333-4333-8333-333333333333',
  version: 4,
};
const ALT_SPARE: WorkoutExerciseReference = {
  source: 'global',
  identity_id: '66666666-6666-4666-8666-666666666666',
  version: 1,
};

const ACTIVE_KEY = alternativeKey(ALT_ACTIVE);
const REMOVED_KEY = alternativeKey(ALT_REMOVED);
const SPARE_KEY = alternativeKey(ALT_SPARE);

export const F17_ALTERNATIVES: {
  alternatives: WorkoutExerciseReference[];
  availability: Record<string, 'active' | 'removed' | 'merged'>;
  names: Record<string, string>;
  candidates: AlternativeCandidate[];
} = {
  alternatives: [ALT_ACTIVE, ALT_REMOVED],
  availability: {
    [ACTIVE_KEY]: 'active',
    [REMOVED_KEY]: 'removed',
    [SPARE_KEY]: 'active',
  },
  names: {
    [ACTIVE_KEY]: 'Push-Up',
    [REMOVED_KEY]: 'Old Fly',
    [SPARE_KEY]: 'Squat',
  },
  candidates: [
    { ref: ALT_ACTIVE, name: 'Push-Up' },
    { ref: ALT_SPARE, name: 'Squat' },
  ],
};

export const F17_VOLUME_MUSCLES: Record<string, MuscleMembership> = {
  bench: { primary: 'chest', secondaries: ['triceps', 'front_delts'] },
  squat: { primary: 'quads', secondaries: ['glutes'] },
};

export const F17_VOLUME_DAYS: VolumeDay[] = [
  {
    dayIndex: 1,
    kind: 'session',
    items: [
      {
        exerciseId: 'bench',
        sets: [
          { type: 'working', exerciseId: 'bench' },
          { type: 'working', exerciseId: 'bench' },
          { type: 'working', exerciseId: 'bench' },
          { type: 'warmup', exerciseId: 'bench' },
        ],
      },
    ],
  },
  { dayIndex: 2, kind: 'rest', items: [] },
  {
    dayIndex: 3,
    kind: 'session',
    items: [
      {
        exerciseId: 'squat',
        sets: [
          { type: 'working', exerciseId: 'squat' },
          { type: 'working', exerciseId: 'squat' },
        ],
      },
    ],
  },
];

export const F17_PRINT_PAYLOAD: WorkoutExportPayload = {
  planTitle: 'Hypertrophy Block A',
  planIdentity: 'LFT-0042 · Revision 2',
  planNotes: 'Plan note: keep progressive overload steady.',
  documentNotes: 'Document note: log every working set.',
  days: [
    {
      kind: 'session',
      title: 'Upper Body Push',
      notes: 'Day 1 note: warm up shoulders well.',
      items: [
        {
          name: 'Incline Dumbbell Press',
          description: '30-degree bench, controlled eccentric',
          reps: { min: 8, max: 10 },
          restSec: 120,
          rir: 2,
          notes: 'Pause 1s at the bottom',
          alternatives: [{ name: 'Barbell Incline Press' }],
          videoUrl: 'https://video.example.com/incline-db-press',
          sets: [
            { type: 'warmup', load: { mode: 'bodyweight' } },
            {
              type: 'working',
              load: { mode: 'added_weight', value: '32.5', unit: 'kg' },
            },
          ],
        },
        {
          name: 'Plank Hold',
          reps: { value: 45 },
          restSec: 60,
          rir: 0,
          notes: 'Zero-set entry still renders prescriptions',
          alternatives: [],
          sets: [],
        },
      ],
    },
    {
      kind: 'rest',
      title: 'Recovery',
      notes: 'Walk 20 minutes.',
      items: [],
    },
  ],
};
