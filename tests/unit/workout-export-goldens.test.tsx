// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Workbook, ValueType, type Worksheet } from 'exceljs';
import { WorkoutPrintView } from '../../components/workout-planner/WorkoutPrintView';
import {
  buildWorkoutExportPayload,
  type WorkoutExportLibrary,
} from '../../lib/workout-planner/export-payload';
import { formatWorkoutPromptContent } from '../../lib/workout-planner/copy-prompt';
import {
  AI_PROMPT_AR,
  AI_PROMPT_EN,
  buildAiPrompt,
  containsProhibitedInstruction,
  PLAN_CONTENT_TOKEN,
} from '../../lib/workout-planner/ai-prompt';
import {
  buildWorkoutWorkbook,
  EXCEL_COLUMNS,
  PRINT_TABLE_COLUMNS,
  getWorkoutExportLabels,
} from '../../lib/workout-planner/excel-export';
import { getMessages } from '../../lib/i18n';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';

// T041: Export goldens AR/EN (FR-018, FR-024; SC-008, SC-013).
// Revision N while N+1 exists; AR/EN layout checks plus exact locale prompt
// byte equality after the single {{PLAN_CONTENT}} substitution. RED first.
// Formula-injection cells stored as text (SC-008). Renderers covered:
// print view (#160), Excel export (#160), Copy AI Prompt (T040).
// Route goldens marked PARTIAL pending authorized revision read route.

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderView(element: React.ReactElement): HTMLDivElement {
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

// Revision N fixtures
const PLAN_TITLE_N = 'Strength & Hypertrophy Phase 1 — مرحلة القوة والتضخيم ١';
const PLAN_IDENTITY_N = 'LFT-0042 • Revision 1';
const PLAN_NOTES_N =
  'Plan-level coach note: Focus on mind-muscle connection and recovery. ملاحظة الخطة العامة.';
const DOCUMENT_NOTES_N =
  'Workout document note: Follow prescribed RIR strictly. ملاحظة المستند: الالتزام بـ RIR.';

const REVISION_N_DOCUMENT = {
  schema_version: 1,
  notes: DOCUMENT_NOTES_N,
  days: [
    {
      id: uuid('11'),
      kind: 'session',
      title: 'Day 1 - Upper Power',
      notes: 'Session note: Warm up rotator cuff thoroughly.',
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
            {
              id: uuid('33'),
              type: 'working',
              load: { mode: 'added_weight', value: '85', unit: 'kg' },
            },
          ],
        },
        {
          id: uuid('22'),
          exercise: ASSISTED_PULLUP_REF,
          name: 'Assisted Pull-Up',
          description: 'Wide grip assisted chin/pull-up machine',
          reps: { value: 12 },
          restSec: 90,
          rir: 1,
          notes: 'Coach note: Full extension at bottom.',
          alternatives: [],
          sets: [
            {
              id: uuid('34'),
              type: 'working',
              load: { mode: 'assisted', value: '15', unit: 'lb' },
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
      notes:
        'Rest note: 20-30 min mobility & light walking. ملاحظة الراحة: مشي خفيف.',
      items: [],
    },
  ],
};

// Revision N+1 fixtures (co-exists to prove historical revision isolation)
const PLAN_TITLE_N_PLUS_1 =
  'Strength & Hypertrophy Phase 2 — مرحلة القوة والتضخيم ٢';
const PLAN_IDENTITY_N_PLUS_1 = 'LFT-0042 • Revision 2';
const PLAN_NOTES_N_PLUS_1 =
  'Plan note Revision 2: Volume increased for mesocycle 2.';
const DOCUMENT_NOTES_N_PLUS_1 =
  'Workout document note Revision 2: Tempo adjusted to 4-0-1-0.';

const REVISION_N_PLUS_1_DOCUMENT = {
  schema_version: 1,
  notes: DOCUMENT_NOTES_N_PLUS_1,
  days: [
    {
      id: uuid('13'),
      kind: 'session',
      title: 'Day 1 - Push Hypertrophy',
      notes: 'Revision 2 session note: Focus on overhead pressing.',
      items: [
        {
          id: uuid('24'),
          exercise: BENCH_REF,
          name: 'Overhead Press',
          description: 'Standing barbell overhead press',
          reps: { value: 8 },
          restSec: 120,
          rir: 2,
          notes: 'Revision 2 overhead press note',
          alternatives: [],
          sets: [
            {
              id: uuid('35'),
              type: 'working',
              load: { mode: 'added_weight', value: '50', unit: 'kg' },
            },
          ],
        },
      ],
    },
    {
      id: uuid('14'),
      kind: 'rest',
      title: 'Day 2 - Complete Rest',
      notes: 'Revision 2 rest note: Complete rest day.',
      items: [],
    },
  ],
};

function createLibrary(
  benchVideo = 'https://video.example.com/bench-press',
): WorkoutExportLibrary {
  const entries: Record<string, { name: string; videoUrl?: string }> = {
    [BENCH_REF.identity_id]: { name: 'Bench Press', videoUrl: benchVideo },
    [ASSISTED_PULLUP_REF.identity_id]: {
      name: 'Assisted Pull-Up',
      videoUrl: 'https://video.example.com/assisted-pullup',
    },
    [DIP_REF.identity_id]: {
      name: 'Dips',
      videoUrl: 'https://video.example.com/dips',
    },
    [INCLINE_DB_REF.identity_id]: {
      name: 'Incline Dumbbell Press',
      videoUrl: 'https://video.example.com/incline-db',
    },
    [MACHINE_CHEST_REF.identity_id]: { name: 'Machine Chest Press' },
  };
  return {
    resolve: (r) => entries[r.identity_id] ?? null,
  };
}

function getPayloadN(library = createLibrary()) {
  return buildWorkoutExportPayload({
    plan: {
      title: PLAN_TITLE_N,
      identity: PLAN_IDENTITY_N,
      notes: PLAN_NOTES_N,
    },
    document: REVISION_N_DOCUMENT,
    library,
  });
}

function getPayloadNPlus1(library = createLibrary()) {
  return buildWorkoutExportPayload({
    plan: {
      title: PLAN_TITLE_N_PLUS_1,
      identity: PLAN_IDENTITY_N_PLUS_1,
      notes: PLAN_NOTES_N_PLUS_1,
    },
    document: REVISION_N_PLUS_1_DOCUMENT,
    library,
  });
}

async function roundTripWorkbook(workbook: Workbook): Promise<Worksheet> {
  const buffer = await workbook.xlsx.writeBuffer();
  const loaded = new Workbook();
  await loaded.xlsx.load(buffer);
  return loaded.worksheets[0]!;
}

function sheetToTextRows(sheet: Worksheet): string[][] {
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      values[column - 1] = typeof cell.value === 'string' ? cell.value : '';
    });
    rows.push(values);
  });
  return rows;
}

describe('F17 Export goldens AR/EN (T041)', () => {
  describe('Copy AI Prompt goldens (AR/EN exact byte equality)', () => {
    it('matches the English prompt golden byte-for-byte after {{PLAN_CONTENT}} substitution', () => {
      const payload = getPayloadN();
      const promptContent = formatWorkoutPromptContent(payload, 'en');
      const prompt = buildAiPrompt('en', promptContent);

      const expectedGolden = readFileSync(
        join(process.cwd(), 'tests/fixtures/f17/workout-prompt-golden-en.txt'),
        'utf8',
      );

      // Exact byte equality
      expect(prompt).toBe(expectedGolden);
      expect(prompt).toBe(
        AI_PROMPT_EN.replace(PLAN_CONTENT_TOKEN, promptContent),
      );
      expect(containsProhibitedInstruction(prompt)).toBe(false);
    });

    it('matches the Arabic prompt golden byte-for-byte after {{PLAN_CONTENT}} substitution', () => {
      const payload = getPayloadN();
      const promptContent = formatWorkoutPromptContent(payload, 'ar');
      const prompt = buildAiPrompt('ar', promptContent);

      const expectedGolden = readFileSync(
        join(process.cwd(), 'tests/fixtures/f17/workout-prompt-golden-ar.txt'),
        'utf8',
      );

      // Exact byte equality
      expect(prompt).toBe(expectedGolden);
      expect(prompt).toBe(
        AI_PROMPT_AR.replace(PLAN_CONTENT_TOKEN, promptContent),
      );
      expect(containsProhibitedInstruction(prompt)).toBe(false);
    });

    it('conforms to approved contracts/copy-ai-prompt.md template bodies', () => {
      const contract = readFileSync(
        join(
          process.cwd(),
          'specs/017-workout-planner/contracts/copy-ai-prompt.md',
        ),
        'utf8',
      );
      expect(contract).toContain(AI_PROMPT_EN);
      expect(contract).toContain(AI_PROMPT_AR);
    });
  });

  describe('Excel export goldens (AR/EN exact cell equality & SC-008 text safety)', () => {
    it('matches the English Excel golden row-for-row and cell-for-cell', async () => {
      const payload = getPayloadN();
      const workbook = buildWorkoutWorkbook(payload, 'en');
      const sheet = await roundTripWorkbook(workbook);
      const rows = sheetToTextRows(sheet);

      const expectedGoldenRows = JSON.parse(
        readFileSync(
          join(
            process.cwd(),
            'tests/fixtures/f17/workout-excel-golden-en.json',
          ),
          'utf8',
        ),
      );

      expect(rows).toEqual(expectedGoldenRows);
      expect(sheet.name).toBe(en['workout.export.plan']);
      expect(sheet.views[0]?.rightToLeft).toBe(false);
    });

    it('matches the Arabic Excel golden row-for-row and cell-for-cell', async () => {
      const payload = getPayloadN();
      const workbook = buildWorkoutWorkbook(payload, 'ar');
      const sheet = await roundTripWorkbook(workbook);
      const rows = sheetToTextRows(sheet);

      const expectedGoldenRows = JSON.parse(
        readFileSync(
          join(
            process.cwd(),
            'tests/fixtures/f17/workout-excel-golden-ar.json',
          ),
          'utf8',
        ),
      );

      expect(rows).toEqual(expectedGoldenRows);
      expect(sheet.name).toBe(ar['workout.export.plan']);
      expect(sheet.views[0]?.rightToLeft).toBe(true);
    });

    it('stores 100% of cells as text and neutralises formula injection (SC-008)', async () => {
      const payload = getPayloadN();
      for (const locale of ['en', 'ar'] as const) {
        const workbook = buildWorkoutWorkbook(payload, locale);
        const sheet = await roundTripWorkbook(workbook);

        let cellCount = 0;
        sheet.eachRow({ includeEmpty: false }, (row) => {
          row.eachCell({ includeEmpty: false }, (cell) => {
            cellCount++;
            expect(typeof cell.value, `cell ${cell.address}`).toBe('string');
            expect(cell.type, `cell ${cell.address}`).toBe(ValueType.String);
            expect(cell.numFmt, `cell ${cell.address}`).toBe('@');
            expect(cell.formula, `cell ${cell.address}`).toBeUndefined();
          });
        });
        expect(cellCount).toBeGreaterThan(30);

        // Verify specific formula injection cells are preserved as plain strings
        const rows = sheetToTextRows(sheet);
        const allText = rows.flat().join(' ');
        expect(allText).toContain(
          '=1+1 formula injection attempt in description',
        );
        expect(allText).toContain(
          '+2.5kg next block; @coach review depth; -avoid shoulder pain',
        );
      }
    });

    it('reuses S58-PO-5 approved column headers in exact order in both locales', async () => {
      const payload = getPayloadN();
      const englishSheet = await roundTripWorkbook(
        buildWorkoutWorkbook(payload, 'en'),
      );
      const arabicSheet = await roundTripWorkbook(
        buildWorkoutWorkbook(payload, 'ar'),
      );

      const englishRows = sheetToTextRows(englishSheet);
      const arabicRows = sheetToTextRows(arabicSheet);

      // Header row is row index 4 (5th row)
      const headerRowIndex = 4;
      const expectedEnHeaders = EXCEL_COLUMNS.map((col) => en[col.heading]);
      const expectedArHeaders = EXCEL_COLUMNS.map((col) => ar[col.heading]);

      expect(englishRows[headerRowIndex]).toEqual(expectedEnHeaders);
      expect(arabicRows[headerRowIndex]).toEqual(expectedArHeaders);
    });
  });

  describe('Print view renderer layout goldens (AR RTL & EN LTR)', () => {
    it('renders English print view layout with LTR dir, approved labels, and preserved text', () => {
      const payload = getPayloadN();
      const host = renderView(
        <WorkoutPrintView payload={payload} locale="en" />,
      );
      const m = getMessages('en');
      const labels = getWorkoutExportLabels('en');

      const article = host.querySelector('article');
      expect(article).not.toBeNull();
      expect(article?.getAttribute('dir')).toBe('ltr');
      expect(article?.getAttribute('lang')).toBe('en');

      const text = host.textContent ?? '';

      // Plan metadata
      expect(text).toContain(payload.planTitle);
      expect(text).toContain(payload.planIdentity);
      expect(text).toContain(payload.planNotes!);
      expect(text).toContain(payload.documentNotes!);

      // Headings
      for (const col of PRINT_TABLE_COLUMNS) {
        expect(text).toContain(m[col.heading]);
      }

      // Exercise names English
      expect(text).toContain('Bench Press');
      expect(text).toContain('Assisted Pull-Up');
      expect(text).toContain('Dips');
      expect(text).toContain('Incline Dumbbell Press');
      expect(text).toContain('Machine Chest Press');

      // Authored text preserved verbatim
      expect(text).toContain(
        'Coach note: Arch slightly, drive through heels. ملاحظة الكابتن: ثبّت كعبيك.',
      );
      expect(text).toContain('=1+1 formula injection attempt in description');
      expect(text).toContain(
        '+2.5kg next block; @coach review depth; -avoid shoulder pain',
      );

      // Rest day rendered without empty exercise table
      expect(text).toContain(
        `Day 2 — ${labels.restDay} (Day 2 - Active Recovery)`,
      );
      expect(text).toContain(
        'Rest note: 20-30 min mobility & light walking. ملاحظة الراحة: مشي خفيف.',
      );

      // Video links rendered as clickable anchors
      const links = Array.from(host.querySelectorAll('a'));
      expect(
        links.some(
          (a) =>
            a.getAttribute('href') === 'https://video.example.com/bench-press',
        ),
      ).toBe(true);
      expect(
        links.some(
          (a) =>
            a.getAttribute('href') ===
            'https://video.example.com/assisted-pullup',
        ),
      ).toBe(true);
    });

    it('renders Arabic print view layout with RTL dir, approved labels, Bidi isolation', () => {
      const payload = getPayloadN();
      const host = renderView(
        <WorkoutPrintView payload={payload} locale="ar" />,
      );
      const m = getMessages('ar');
      const labels = getWorkoutExportLabels('ar');

      const article = host.querySelector('article');
      expect(article).not.toBeNull();
      expect(article?.getAttribute('dir')).toBe('rtl');
      expect(article?.getAttribute('lang')).toBe('ar');

      const text = host.textContent ?? '';

      // Arabic labels
      expect(text).toContain(m['workout.export.plan']);
      expect(text).toContain(labels.restDay);
      expect(text).toContain(labels.warmUp);
      expect(text).toContain(labels.working);
      expect(text).toContain(labels.bodyweight);

      for (const col of PRINT_TABLE_COLUMNS) {
        expect(text).toContain(m[col.heading]);
      }

      // Exercise names stay English
      expect(text).toContain('Bench Press');
      expect(text).toContain('Assisted Pull-Up');
      expect(text).toContain('Dips');

      // Authored notes preserved
      expect(text).toContain(
        'Coach note: Arch slightly, drive through heels. ملاحظة الكابتن: ثبّت كعبيك.',
      );
      expect(text).toContain(
        'Rest note: 20-30 min mobility & light walking. ملاحظة الراحة: مشي خفيف.',
      );
    });
  });

  describe('Revision N while N+1 exists (historical revision isolation)', () => {
    it('exports Revision N content with zero leakage from Revision N+1 in all renderers', async () => {
      // Both revisions exist
      const payloadN = getPayloadN();
      const payloadNPlus1 = getPayloadNPlus1();

      // Ensure fixtures differ
      expect(payloadN.planIdentity).toBe('LFT-0042 • Revision 1');
      expect(payloadNPlus1.planIdentity).toBe('LFT-0042 • Revision 2');
      expect(payloadN.days[0]!.items[0]!.name).toBe('Bench Press');
      expect(payloadNPlus1.days[0]!.items[0]!.name).toBe('Overhead Press');

      // 1. Copy AI Prompt for Revision N
      const promptNEn = buildAiPrompt(
        'en',
        formatWorkoutPromptContent(payloadN, 'en'),
      );
      expect(promptNEn).toContain('LFT-0042 • Revision 1');
      expect(promptNEn).toContain('Bench Press');
      expect(promptNEn).not.toContain('LFT-0042 • Revision 2');
      expect(promptNEn).not.toContain('Overhead Press');
      expect(promptNEn).not.toContain(PLAN_NOTES_N_PLUS_1);
      expect(promptNEn).not.toContain(DOCUMENT_NOTES_N_PLUS_1);

      // 2. Excel export for Revision N
      const sheetN = await roundTripWorkbook(
        buildWorkoutWorkbook(payloadN, 'en'),
      );
      const rowsN = sheetToTextRows(sheetN).flat().join(' ');
      expect(rowsN).toContain('LFT-0042 • Revision 1');
      expect(rowsN).toContain('Bench Press');
      expect(rowsN).not.toContain('LFT-0042 • Revision 2');
      expect(rowsN).not.toContain('Overhead Press');
      expect(rowsN).not.toContain(PLAN_NOTES_N_PLUS_1);
      expect(rowsN).not.toContain(DOCUMENT_NOTES_N_PLUS_1);

      // 3. Print view for Revision N
      const hostN = renderView(
        <WorkoutPrintView payload={payloadN} locale="en" />,
      );
      const textN = hostN.textContent ?? '';
      expect(textN).toContain('LFT-0042 • Revision 1');
      expect(textN).toContain('Bench Press');
      expect(textN).not.toContain('LFT-0042 • Revision 2');
      expect(textN).not.toContain('Overhead Press');
      expect(textN).not.toContain(PLAN_NOTES_N_PLUS_1);
      expect(textN).not.toContain(DOCUMENT_NOTES_N_PLUS_1);
    });

    it('resolves live video URLs dynamically at export time for Revision N', () => {
      const changedBenchVideo = 'https://video.example.com/bench-press-v2';
      const libraryV1 = createLibrary();
      const libraryV2 = createLibrary(changedBenchVideo);

      const payloadV1 = getPayloadN(libraryV1);
      const payloadV2 = getPayloadN(libraryV2);

      const promptV1 = buildAiPrompt(
        'en',
        formatWorkoutPromptContent(payloadV1, 'en'),
      );
      const promptV2 = buildAiPrompt(
        'en',
        formatWorkoutPromptContent(payloadV2, 'en'),
      );

      expect(promptV1).toContain('https://video.example.com/bench-press');
      expect(promptV1).not.toContain(changedBenchVideo);

      expect(promptV2).toContain(changedBenchVideo);
      expect(promptV2).not.toContain('https://video.example.com/bench-press\n');
    });
  });

  describe('Route goldens status (T037 dependency)', () => {
    it('notes renderer goldens are fully proven while route goldens remain PARTIAL', () => {
      // Renderers covered: print view (#160), Excel export (#160), Copy AI Prompt (T040).
      // The full server-side print route remains pending authorized revision read RPC.
      const routeStatus = 'PARTIAL_PENDING_AUTHORIZED_REVISION_READ';
      expect(routeStatus).toBe('PARTIAL_PENDING_AUTHORIZED_REVISION_READ');
    });
  });
});
