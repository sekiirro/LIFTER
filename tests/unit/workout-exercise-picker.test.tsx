import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ExercisePicker } from '../../components/workout-planner/ExercisePicker';
import {
  buildPickerAddSelection,
  buildPickerSearch,
  capPickerResults,
  createPickerDebounce,
  EXERCISE_PICKER_DEBOUNCE_MS,
  EXERCISE_PICKER_MAX_RESULTS,
  selectPickerItems,
  type ExercisePickerItem,
} from '../../lib/workout-planner/exercise-picker';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

function item(overrides: Partial<ExercisePickerItem> = {}): ExercisePickerItem {
  return {
    id: 'ex-bench',
    source: 'global',
    names: { en: 'Bench Press', ar: 'ضغط الصدر' },
    version: 3,
    primaryMuscle: 'chest',
    equipment: 'barbell',
    lifecycleState: 'active',
    defaults: {
      restSec: 90,
      rir: 2,
      reps: { value: 8 },
      description: 'Flat bench',
      notes: 'Tuck elbows',
    },
    ...overrides,
  };
}

function manyItems(count: number): ExercisePickerItem[] {
  return Array.from({ length: count }, (_, index) =>
    item({
      id: `ex-${index}`,
      names: { en: `Exercise ${index}`, ar: `تمرين ${index}` },
      version: 1,
    }),
  );
}

function renderPicker(
  locale: 'ar' | 'en',
  props: Record<string, unknown> = {},
) {
  return renderToStaticMarkup(
    createElement(ExercisePicker, {
      locale,
      items: [item()],
      ...props,
    }),
  );
}

describe('F17 T032 exercise picker lib (FR-023, FR-024)', () => {
  it('caps results at the F16 contract maximum of 50, keeping order', () => {
    expect(EXERCISE_PICKER_MAX_RESULTS).toBe(50);
    const capped = capPickerResults(manyItems(60));
    expect(capped).toHaveLength(50);
    expect(capped[0]?.id).toBe('ex-0');
    expect(capped[49]?.id).toBe('ex-49');
    expect(capPickerResults(manyItems(50))).toHaveLength(50);
    expect(capPickerResults(manyItems(3))).toHaveLength(3);
  });

  it('pins the current version in the add payload (no older versions offered)', () => {
    expect(buildPickerAddSelection(item({ source: 'global' }))).toEqual({
      source: 'global',
      exerciseId: 'ex-bench',
      version: 3,
    });
    expect(
      buildPickerAddSelection(
        item({ source: 'workspace_private', workspaceId: 'ws-1' }),
      ),
    ).toEqual({
      source: 'workspace_private',
      exerciseId: 'ex-bench',
      version: 3,
      workspaceId: 'ws-1',
    });
    expect(buildPickerAddSelection(item({ version: 5 }))?.version).toBe(5);
    expect(buildPickerAddSelection(null)).toBeNull();
  });

  it('matches AR/EN normalized queries, filters, active-only, own workspace only', () => {
    const items = [
      item({ id: 'a', names: { en: 'Bench Press', ar: 'ضغط الصدر' } }),
      item({
        id: 'b',
        names: { en: 'Squat', ar: 'إختبار القرفصاء' },
        primaryMuscle: 'quads',
        equipment: 'barbell',
      }),
      item({ id: 'c', lifecycleState: 'removed' }),
      item({ id: 'd', lifecycleState: 'merged' }),
      item({
        id: 'e',
        source: 'workspace_private',
        workspaceId: 'ws-foreign',
      }),
      item({
        id: 'f',
        source: 'workspace_private',
        workspaceId: 'ws-own',
        names: { en: 'Deadlift', ar: 'الرفعة الميتة' },
      }),
    ];
    // Arabic alef-form-insensitive match (إختبار matches اختبار).
    expect(
      selectPickerItems(items, 'اختبار', {}, 'ws-own').map((i) => i.id),
    ).toEqual(['b']);
    expect(
      selectPickerItems(items, 'bench', {}, 'ws-own').map((i) => i.id),
    ).toEqual(['a']);
    expect(
      selectPickerItems(items, 'الصدر', {}, 'ws-own').map((i) => i.id),
    ).toEqual(['a']);
    expect(
      selectPickerItems(items, '', { muscleGroup: 'quads' }, 'ws-own').map(
        (i) => i.id,
      ),
    ).toEqual(['b']);
    expect(
      selectPickerItems(items, '', { equipment: 'cable' }, 'ws-own'),
    ).toEqual([]);
    // Removed/merged/superseded-away never surface.
    expect(selectPickerItems(items, '', {}, 'ws-own').map((i) => i.id)).toEqual(
      ['a', 'b', 'f'],
    );
    expect(
      selectPickerItems(items, '', {}, undefined).map((i) => i.id),
    ).toEqual(['a', 'b', 'e', 'f']);
  });

  it('builds a bounded F16 search (limit 50, trimmed query)', () => {
    const search = buildPickerSearch('  bench ', { muscleGroup: 'chest' });
    expect(search.kind).toBe('exercise');
    expect(search.query).toBe('bench');
    expect(search.limit).toBe(50);
    expect(search.filters).toEqual({ muscleGroup: 'chest' });
    const scoped = buildPickerSearch('', {}, 'ws-1');
    expect(scoped.kind).toBe('workspace_exercise');
    expect(scoped.workspaceScope).toEqual({ workspaceId: 'ws-1' });
    expect(scoped.limit).toBe(50);
  });

  it('debounces search emission (trailing edge), with flush and cancel', () => {
    expect(EXERCISE_PICKER_DEBOUNCE_MS).toBe(250);
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      const debounced = createPickerDebounce((q: string) => {
        calls.push(q);
      }, EXERCISE_PICKER_DEBOUNCE_MS);
      debounced.schedule('b');
      debounced.schedule('be');
      debounced.schedule('ben');
      expect(calls).toEqual([]);
      vi.advanceTimersByTime(EXERCISE_PICKER_DEBOUNCE_MS);
      expect(calls).toEqual(['ben']);

      debounced.schedule('x');
      debounced.flush();
      expect(calls).toEqual(['ben', 'x']);

      debounced.schedule('y');
      debounced.cancel();
      vi.advanceTimersByTime(EXERCISE_PICKER_DEBOUNCE_MS);
      expect(calls).toEqual(['ben', 'x']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('F17 T032 ExercisePicker UI (FR-023, FR-024)', () => {
  it('renders EN search, filters, bounded list, explicit version display and add', () => {
    const html = renderPicker('en', { items: manyItems(60) });
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
    expect(html).toContain(en['builder.chooseExercise']);
    expect(html).toContain(en['catalog.searchLabel']);
    expect(html).toContain(en['catalog.searchPlaceholder']);
    expect(html).toContain(en['catalog.searchSubmit']);
    expect(html).toContain(en['catalog.clear']);
    expect(html).toContain(en['catalog.filters']);
    expect(html).toContain(en['catalog.filterMuscle']);
    expect(html).toContain(en['catalog.filterEquipment']);
    expect(html).toContain(en['catalog.editorGlobalScope']);
    expect(html).toContain(en['catalog.detailVersion']);
    expect(html).toContain(en['builder.addExercise']);
    expect(html).toContain('data-testid="exercise-picker-list"');
    // Bounded: exactly 50 rows even with 60 items.
    expect(html.match(/data-testid="exercise-picker-row"/g)).toHaveLength(50);
    expect(html).toContain('Exercise 0');
    expect(html).toContain('Exercise 49');
    expect(html).not.toContain('Exercise 50');
    expect(html).toContain('Results: 50');
    // No selection yet: explicit hint, no version selector.
    expect(html).toContain(en['builder.noExerciseSelected']);
    expect(html).not.toContain('data-testid="exercise-picker-version"');
  });

  it('shows the explicit current version read-only with no version control for the chosen exercise', () => {
    const html = renderPicker('en', { initialSelectedId: 'ex-bench' });
    // No version control is offered (T031 RPC pins the current server-side).
    expect(html).not.toContain('data-testid="exercise-picker-version"');
    const detailBlock =
      html.split('data-testid="exercise-picker-detail"')[1] ?? '';
    expect(detailBlock).not.toContain('<select');
    expect(detailBlock).not.toContain('<option');
    // Explicit current version, read-only, under the approved label.
    expect(html).toContain(en['templates.version']);
    expect(html).toContain('>3<');
    expect(html).not.toContain(en['builder.noExerciseSelected']);
  });

  it('previews defaults read-only (values that WILL be copied at add)', () => {
    const html = renderPicker('en', { initialSelectedId: 'ex-bench' });
    expect(html).toContain('data-testid="exercise-picker-defaults"');
    expect(html).toContain(en['catalog.editorDefaultsTitle']);
    expect(html).toContain(en['catalog.editorRest']);
    expect(html).toContain(en['catalog.editorRir']);
    expect(html).toContain(en['catalog.editorReps']);
    expect(html).toContain(en['catalog.editorDescription']);
    expect(html).toContain(en['catalog.editorNotes']);
    expect(html).toContain('Flat bench');
    expect(html).toContain('Tuck elbows');
    // Read-only preview: the defaults block is a definition list, never inputs.
    const defaultsBlock =
      html
        .split('data-testid="exercise-picker-defaults"')[1]
        ?.split('</dl>')[0] ?? '';
    expect(defaultsBlock).toContain('<div><dt>');
    expect(defaultsBlock).not.toContain('<input');
    expect(defaultsBlock).not.toContain('<select');

    const missing = renderPicker('en', {
      items: [item({ defaults: undefined })],
      initialSelectedId: 'ex-bench',
    });
    expect(missing).toContain(en['catalog.editorNone']);
  });

  it('renders AR RTL with approved strings and Arabic-Indic digits', () => {
    const html = renderPicker('ar', {
      items: [
        item(),
        item({ id: 'ex-2', names: { en: 'Squat', ar: 'القرفصاء' } }),
      ],
    });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain(ar['builder.chooseExercise']);
    expect(html).toContain(ar['catalog.searchLabel']);
    expect(html).toContain(ar['catalog.filters']);
    expect(html).toContain(ar['catalog.editorGlobalScope']);
    expect(html).toContain(ar['catalog.detailVersion']);
    expect(html).toContain(ar['builder.addExercise']);
    expect(html).toContain(ar['builder.noExerciseSelected']);
    expect(html).toContain('ضغط الصدر');
    expect(html).toContain('القرفصاء');
    // Arabic-Indic count digits.
    expect(html).toContain('النتائج: ٢');
  });

  it('renders loading, empty, no-results and error states', () => {
    const loading = renderPicker('en', { status: 'loading' });
    expect(loading).toContain('data-testid="exercise-picker-loading"');
    expect(loading).toContain(en['catalog.loading']);

    const empty = renderPicker('en', { items: [] });
    expect(empty).toContain(en['catalog.emptyTitle']);
    expect(empty).toContain(en['catalog.emptyDescription']);

    const noResults = renderPicker('en', {
      items: [item()],
      serverFiltered: false,
      initialQuery: 'zzz-no-match',
    });
    expect(noResults).toContain(en['catalog.noResultsTitle']);
    expect(noResults).toContain(en['catalog.noResultsDescription']);

    const error = renderPicker('en', { status: 'error' });
    expect(error).toContain(en['catalog.errorTitle']);
    expect(error).toContain(en['catalog.errorDescription']);
    expect(error).toContain(en['catalog.retry']);
  });

  it('matches the PO-approved EN and AR strings exactly', () => {
    expect(en['builder.chooseExercise']).toBe('Choose an exercise');
    expect(en['builder.noExerciseSelected']).toBe('Choose an exercise first.');
    expect(en['builder.addExercise']).toBe('Add exercise');
    expect(en['catalog.searchLabel']).toBe('Search the library');
    expect(en['catalog.filters']).toBe('Filters');
    expect(en['templates.version']).toBe('Version');
    expect(en['catalog.detailVersion']).toBe('Current version');
    expect(en['catalog.editorDefaultsTitle']).toBe('Plan defaults');
    expect(en['catalog.editorNone']).toBe('Not set');

    expect(ar['builder.chooseExercise']).toBe('اختر تمرينًا');
    expect(ar['builder.noExerciseSelected']).toBe('اختر تمرينًا أولًا.');
    expect(ar['builder.addExercise']).toBe('إضافة تمرين');
    expect(ar['catalog.searchLabel']).toBe('البحث في المكتبة');
    expect(ar['catalog.filters']).toBe('عوامل التصفية');
    expect(ar['templates.version']).toBe('الإصدار');
    expect(ar['catalog.detailVersion']).toBe('الإصدار الحالي');
    expect(ar['catalog.editorDefaultsTitle']).toBe('إعدادات الخطة الافتراضية');
    expect(ar['catalog.editorNone']).toBe('غير محدد');
  });
});
