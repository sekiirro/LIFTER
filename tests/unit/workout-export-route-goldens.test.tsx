// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Workbook } from 'exceljs';
import { WorkoutPrintView } from '../../components/workout-planner/WorkoutPrintView';
import {
  AI_PROMPT_AR,
  AI_PROMPT_EN,
  PLAN_CONTENT_TOKEN,
} from '../../lib/workout-planner/ai-prompt';
import { formatWorkoutPromptContent } from '../../lib/workout-planner/copy-prompt';
import {
  buildWorkoutWorkbook,
  getWorkoutExportLabels,
  PRINT_TABLE_COLUMNS,
} from '../../lib/workout-planner/excel-export';
import { getMessages } from '../../lib/i18n';

// T041 remaining clause: route goldens for the authorized published-revision
// read path (FR-018, FR-024; SC-008, SC-013). Both routes below go through the
// real route handlers, the real authorized export reader, and the real
// prompt/Excel/print renderers. Only the Supabase session client and actor
// loader are mocked (same pattern as T037/T040 route tests), so no DB stack is
// needed. Revision N is selected while Revision N+1 exists.

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  return {
    create: vi.fn(),
    actor: vi.fn(),
    from: vi.fn(),
    rpc: vi.fn(),
    getUser: vi.fn(),
    query,
    filters: [] as unknown[][],
    rows: [] as Array<Record<string, unknown>>,
  };
});

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({ createSessionClient: m.create }));
vi.mock('../../lib/auth/actor', () => ({ loadActorRows: m.actor }));

import { GET as copyPromptRoute } from '../../app/api/workouts/copy-prompt/route';
import { GET as printRoute } from '../../app/api/workouts/print/route';

const uuid = (tail: string) =>
  `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const ref = (tail: string) => ({
  source: 'global' as const,
  identity_id: uuid(tail),
  version: 1,
});

const BENCH_REF = ref('1');
const ASSISTED_PULLUP_REF = ref('2');
const DIP_REF = ref('3');
const INCLINE_DB_REF = ref('4');
const MACHINE_CHEST_REF = ref('5');

const WS = uuid('900');
const REVISION_N_ID = uuid('901');
const REVISION_N_PLUS_1_ID = uuid('902');
const PLAN_ID = uuid('903');

const CATALOG: Record<string, { name: string; video?: string }> = {
  [BENCH_REF.identity_id]: {
    name: 'Bench Press',
    video: 'https://video.example.com/bench-press',
  },
  [ASSISTED_PULLUP_REF.identity_id]: {
    name: 'Assisted Pull-Up',
    video: 'https://video.example.com/assisted-pullup',
  },
  [DIP_REF.identity_id]: {
    name: 'Dips',
    video: 'https://video.example.com/dips',
  },
  [INCLINE_DB_REF.identity_id]: {
    name: 'Incline Dumbbell Press',
    video: 'https://video.example.com/incline-db',
  },
  [MACHINE_CHEST_REF.identity_id]: { name: 'Machine Chest Press' },
};

const REVISION_N_DOCUMENT = {
  schema_version: 1,
  notes:
    'Route note: Follow prescribed RIR strictly. ملاحظة المستند: الالتزام بـ RIR.',
  days: [
    {
      id: uuid('11'),
      kind: 'session',
      title: 'Day 1 - Upper Power',
      notes: 'Route session note: Warm up rotator cuff thoroughly.',
      items: [
        {
          id: uuid('21'),
          exercise: BENCH_REF,
          name: 'Bench Press',
          description: 'Barbell flat bench press on competition bench',
          reps: { min: 8, max: 10 },
          restSec: 120,
          rir: 2,
          notes:
            'Coach note: Arch slightly, drive through heels. ملاحظة الكابتن: ثبّت كعبيك.',
          alternatives: [INCLINE_DB_REF, MACHINE_CHEST_REF],
          sets: [
            { id: uuid('31'), type: 'warmup', load: { mode: 'bodyweight' } },
            {
              id: uuid('32'),
              type: 'working',
              load: { mode: 'added_weight', value: '80', unit: 'kg' },
            },
          ],
        },
        {
          id: uuid('23'),
          exercise: DIP_REF,
          name: 'Dips',
          description: '=1+1 formula injection attempt in description',
          reps: { value: 15 },
          restSec: 60,
          rir: 0,
          notes: '+2.5kg next block; @coach review depth; -avoid shoulder pain',
          alternatives: [],
          sets: [],
        },
      ],
    },
    {
      id: uuid('12'),
      kind: 'rest',
      title: 'Day 2 - Active Recovery',
      notes: 'Rest note: 20-30 min mobility & light walking.',
      items: [],
    },
  ],
};

const REVISION_N_PLUS_1_DOCUMENT = {
  schema_version: 1,
  notes: 'Revision 2 document note must never leak.',
  days: [
    {
      id: uuid('13'),
      kind: 'session',
      title: 'Day 1 - Push Hypertrophy',
      notes: 'Revision 2 session note must never leak.',
      items: [],
    },
  ],
};

function revisionRow(
  id: string,
  revisionNumber: number,
  content: unknown,
): Record<string, unknown> {
  return {
    id,
    workspace_id: WS,
    plan_id: PLAN_ID,
    revision_number: revisionNumber,
    plan_kind: 'workout',
    content,
  };
}

const goldenPath = (name: string) =>
  join(process.cwd(), 'tests/fixtures/f17', name);

function readGolden(name: string): string {
  return readFileSync(goldenPath(name), 'utf8');
}

const routeRequest = (revision: string, locale: 'en' | 'ar') =>
  new Request(
    `http://local/api/workouts/print?revision=${revision}&locale=${locale}`,
  );

async function printBody(locale: 'en' | 'ar') {
  const response = await printRoute(routeRequest(REVISION_N_ID, locale));
  expect(response.status).toBe(200);
  return response.json();
}

async function promptBody(locale: 'en' | 'ar') {
  const response = await copyPromptRoute(routeRequest(REVISION_N_ID, locale));
  expect(response.status).toBe(200);
  return response.json();
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderView(element: ReactElement): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
  return container;
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
});

beforeEach(() => {
  vi.clearAllMocks();
  m.filters = [];
  m.rows = [
    revisionRow(REVISION_N_ID, 1, REVISION_N_DOCUMENT),
    revisionRow(REVISION_N_PLUS_1_ID, 2, REVISION_N_PLUS_1_DOCUMENT),
  ];
  m.query.select.mockReturnValue(m.query);
  m.query.eq.mockImplementation((key: string, value: unknown) => {
    m.filters.push([key, value]);
    return m.query;
  });
  m.query.maybeSingle.mockImplementation(async () => {
    const id = m.filters.find(([key]) => key === 'id')?.[1];
    const kind = m.filters.find(([key]) => key === 'plan_kind')?.[1];
    const row =
      m.rows.find(
        (candidate) => candidate.id === id && candidate.plan_kind === kind,
      ) ?? null;
    return { data: row, error: null };
  });
  m.from.mockReturnValue(m.query);
  m.create.mockResolvedValue({
    auth: { getUser: m.getUser },
    from: m.from,
    rpc: m.rpc,
  });
  m.getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
  m.actor.mockResolvedValue({
    userId: 'u',
    role: 'trainer',
    activeWorkspaceIds: [WS],
  });
  m.rpc.mockImplementation(
    async (name: string, args: Record<string, unknown>) => {
      if (name === 'record_workout_export_audit') {
        return { data: null, error: null };
      }
      if (name !== 'catalog_exercise_detail') {
        return { data: null, error: { message: 'unexpected rpc' } };
      }
      const detail = CATALOG[String(args.p_exercise_id)];
      if (!detail) return { data: [], error: null };
      return {
        data: [
          {
            payload: { name_en: detail.name },
            ...(detail.video === undefined
              ? {}
              : { variation: { video_url: detail.video } }),
          },
        ],
        error: null,
      };
    },
  );
});

const serialize = (body: unknown) => `${JSON.stringify(body, null, 2)}\n`;

describe('F17 route export goldens (T041 remaining)', () => {
  it('print route returns the exact English payload golden', async () => {
    const body = await printBody('en');
    expect(serialize(body)).toBe(
      readGolden('workout-print-route-golden-en.json'),
    );
    expect(body.status).toBe('ok');
    expect(body.payload.planTitle).toBe(
      getMessages('en')['workout.export.plan'],
    );
    expect(body.payload.planIdentity).toBe('1');
    expect(body.payload.documentNotes).toBe(REVISION_N_DOCUMENT.notes);
    expect(m.rpc).toHaveBeenCalledWith(
      'record_workout_export_audit',
      expect.objectContaining({ p_outcome: 'success', p_format: 'pdf' }),
    );
  });

  it('print route returns the exact Arabic payload golden', async () => {
    const body = await printBody('ar');
    expect(serialize(body)).toBe(
      readGolden('workout-print-route-golden-ar.json'),
    );
    expect(body.status).toBe('ok');
    expect(body.payload.planTitle).toBe(
      getMessages('ar')['workout.export.plan'],
    );
    expect(body.payload.planIdentity).toBe('1');
    expect(body.payload.documentNotes).toBe(REVISION_N_DOCUMENT.notes);
  });

  it('selects Revision N while Revision N+1 exists in both routes', async () => {
    expect(m.rows).toHaveLength(2);
    for (const locale of ['en', 'ar'] as const) {
      const printed = await printBody(locale);
      const prompted = await promptBody(locale);
      const printedText = JSON.stringify(printed);
      for (const text of [printedText, prompted.prompt]) {
        expect(text).toContain('Bench Press');
        expect(text).toContain('Day 1 - Upper Power');
        expect(text).not.toContain('Revision 2 document note must never leak.');
        expect(text).not.toContain('Revision 2 session note must never leak.');
        expect(text).not.toContain('Day 1 - Push Hypertrophy');
      }
    }
  });

  it('copy-prompt route returns the exact English prompt golden after one {{PLAN_CONTENT}} substitution', async () => {
    const body = await promptBody('en');
    const payload = await printBody('en');
    const promptContent = formatWorkoutPromptContent(payload.payload, 'en');
    expect(body.prompt).toBe(
      readGolden('workout-copy-prompt-route-golden-en.txt'),
    );
    expect(body.prompt).toBe(
      AI_PROMPT_EN.replace(PLAN_CONTENT_TOKEN, promptContent),
    );
    expect(body.prompt).not.toContain(PLAN_CONTENT_TOKEN);
  });

  it('copy-prompt route returns the exact Arabic prompt golden after one {{PLAN_CONTENT}} substitution', async () => {
    const body = await promptBody('ar');
    const payload = await printBody('ar');
    const promptContent = formatWorkoutPromptContent(payload.payload, 'ar');
    expect(body.prompt).toBe(
      readGolden('workout-copy-prompt-route-golden-ar.txt'),
    );
    expect(body.prompt).toBe(
      AI_PROMPT_AR.replace(PLAN_CONTENT_TOKEN, promptContent),
    );
    expect(body.prompt).not.toContain(PLAN_CONTENT_TOKEN);
  });

  it('route payload renders the EN LTR layout with UI-language labels and preserved authored text', async () => {
    const body = await printBody('en');
    const host = renderView(
      <WorkoutPrintView payload={body.payload} locale="en" />,
    );
    const mEn = getMessages('en');
    const labels = getWorkoutExportLabels('en');
    const article = host.querySelector('article');

    expect(article?.getAttribute('dir')).toBe('ltr');
    expect(article?.getAttribute('lang')).toBe('en');

    const text = host.textContent ?? '';
    for (const column of PRINT_TABLE_COLUMNS) {
      expect(text).toContain(mEn[column.heading]);
    }
    expect(text).toContain(labels.restDay);
    expect(text).toContain('Bench Press');
    expect(text).toContain('Dips');
    expect(text).toContain('Incline Dumbbell Press');
    expect(text).toContain(
      'Coach note: Arch slightly, drive through heels. ملاحظة الكابتن: ثبّت كعبيك.',
    );
    expect(text).toContain('=1+1 formula injection attempt in description');
  });

  it('route payload renders the AR RTL layout with UI-language labels and English exercise names', async () => {
    const body = await printBody('ar');
    const host = renderView(
      <WorkoutPrintView payload={body.payload} locale="ar" />,
    );
    const mAr = getMessages('ar');
    const labels = getWorkoutExportLabels('ar');
    const article = host.querySelector('article');

    expect(article?.getAttribute('dir')).toBe('rtl');
    expect(article?.getAttribute('lang')).toBe('ar');

    const text = host.textContent ?? '';
    expect(text).toContain(mAr['workout.export.plan']);
    for (const column of PRINT_TABLE_COLUMNS) {
      expect(text).toContain(mAr[column.heading]);
    }
    expect(text).toContain(labels.restDay);
    expect(text).toContain(labels.warmUp);
    expect(text).toContain(labels.working);
    expect(text).toContain(labels.bodyweight);
    expect(text).toContain('Bench Press');
    expect(text).toContain('Dips');
    expect(text).toContain(
      'Route session note: Warm up rotator cuff thoroughly.',
    );
    expect(text).toContain(REVISION_N_DOCUMENT.notes);
  });

  it('route payload keeps every Excel cell a string, including injection payloads (SC-008)', async () => {
    for (const locale of ['en', 'ar'] as const) {
      const body = await printBody(locale);
      const workbook = buildWorkoutWorkbook(body.payload, locale);
      const buffer = await workbook.xlsx.writeBuffer();
      const loaded = new Workbook();
      await loaded.xlsx.load(buffer);
      const sheet = loaded.worksheets[0]!;
      const texts: string[] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          expect(typeof cell.value).toBe('string');
          expect(cell.formula).toBeUndefined();
          texts.push(String(cell.value));
        });
      });
      expect(texts.length).toBeGreaterThan(10);
      expect(texts).toContain('=1+1 formula injection attempt in description');
      expect(texts).toContain(
        '+2.5kg next block; @coach review depth; -avoid shoulder pain',
      );
    }
  });
});
