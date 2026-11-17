import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AlternativesEditor,
  type AlternativesEditorProps,
} from '../../components/workout-planner/AlternativesEditor';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';
import type { WorkoutExerciseReference } from '../../lib/workout-planner/document';
import {
  MAX_WORKOUT_ALTERNATIVES,
  addWorkoutAlternative,
  alternativeKey,
  isAlternativeUnavailable,
  removeWorkoutAlternative,
} from '../../lib/workout-planner/alternatives';

const EXERCISE: WorkoutExerciseReference = {
  source: 'global',
  identity_id: '11111111-1111-4111-8111-111111111111',
  version: 2,
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
const ALT_MERGED: WorkoutExerciseReference = {
  source: 'workspace_private',
  identity_id: '44444444-4444-4444-8444-444444444444',
  version: 1,
  workspace_id: '55555555-5555-4555-8555-555555555555',
};

const ALT_SPARE: WorkoutExerciseReference = {
  source: 'global',
  identity_id: '66666666-6666-4666-8666-666666666666',
  version: 1,
};

const NAMES: Record<string, string> = {
  [alternativeKey(EXERCISE)]: 'Bench Press',
  [alternativeKey(ALT_ACTIVE)]: 'Push-Up',
  [alternativeKey(ALT_REMOVED)]: 'Old Fly',
  [alternativeKey(ALT_MERGED)]: 'Local Dip',
};

const AVAILABILITY: Record<string, 'active' | 'removed' | 'merged'> = {
  [alternativeKey(EXERCISE)]: 'active',
  [alternativeKey(ALT_ACTIVE)]: 'active',
  [alternativeKey(ALT_REMOVED)]: 'removed',
  [alternativeKey(ALT_MERGED)]: 'merged',
  [alternativeKey(ALT_SPARE)]: 'active',
};

function props(
  locale: 'ar' | 'en',
  alternatives: WorkoutExerciseReference[],
): AlternativesEditorProps {
  return {
    locale,
    alternatives,
    availability: AVAILABILITY,
    names: NAMES,
    candidates: [
      { ref: ALT_ACTIVE, name: 'Push-Up' },
      { ref: ALT_REMOVED, name: 'Old Fly' },
      { ref: ALT_MERGED, name: 'Local Dip' },
      { ref: ALT_SPARE, name: 'Squat' },
    ],
    onChange: () => {},
  };
}

function render(locale: 'ar' | 'en', alternatives: WorkoutExerciseReference[]) {
  return renderToStaticMarkup(
    createElement(AlternativesEditor, props(locale, alternatives)),
  );
}

function listSection(html: string): string {
  const match = html.match(
    /<ul[^>]*data-testid="workout-alternatives-list"[^>]*>[\s\S]*?<\/ul>/,
  );
  return match?.[0] ?? '';
}

describe('F17 T034 alternatives pure module (FR-002, FR-003; SC-011)', () => {
  it('caps alternatives at three and rejects the fourth add with invalid_document', () => {
    expect(MAX_WORKOUT_ALTERNATIVES).toBe(3);
    const third = addWorkoutAlternative([ALT_ACTIVE, ALT_REMOVED], ALT_MERGED);
    expect(third).toHaveLength(3);
    expect(() => addWorkoutAlternative(third, EXERCISE)).toThrow(
      'invalid_document',
    );
    // Rejected add leaves the input untouched.
    expect(third).toHaveLength(3);
  });

  it('rejects duplicate and invalid targets without mutation', () => {
    expect(() => addWorkoutAlternative([ALT_ACTIVE], ALT_ACTIVE)).toThrow(
      'invalid_document',
    );
    expect(() =>
      addWorkoutAlternative([], {
        source: 'global',
        identity_id: 'not-a-uuid',
        version: 1,
      } as unknown as WorkoutExerciseReference),
    ).toThrow('invalid_document');
  });

  it('removes by index and rejects out-of-range removal', () => {
    expect(removeWorkoutAlternative([ALT_ACTIVE, ALT_REMOVED], 0)).toEqual([
      ALT_REMOVED,
    ]);
    expect(() => removeWorkoutAlternative([ALT_ACTIVE], 1)).toThrow(
      'invalid_document',
    );
  });

  it('never substitutes an unavailable target', () => {
    const current = [ALT_ACTIVE, ALT_REMOVED, ALT_MERGED];
    const next = removeWorkoutAlternative(current, 0);
    // Removal drops exactly the chosen row; unavailable rows stay byte-identical.
    expect(next).toEqual([ALT_REMOVED, ALT_MERGED]);
    expect(next[0]).toStrictEqual(ALT_REMOVED);
    expect(next[1]).toStrictEqual(ALT_MERGED);
    expect(isAlternativeUnavailable('removed')).toBe(true);
    expect(isAlternativeUnavailable('merged')).toBe(true);
    expect(isAlternativeUnavailable('active')).toBe(false);
  });
});

describe('F17 T034 AlternativesEditor UI (FR-002, FR-003; SC-011)', () => {
  it('renders EN alternatives with add control and empty state copy', () => {
    const html = render('en', [ALT_ACTIVE]);
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
    expect(html).toContain(en['builder.alternatives']);
    expect(html).toContain(en['builder.addAlternative']);
    expect(html).toContain(en['builder.alternativeExercise']);
    expect(html).toContain('Push-Up');

    const empty = render('en', []);
    expect(empty).toContain(en['builder.noAlternatives']);
    expect(listSection(empty)).toBe('');
  });

  it('disables the fourth add at three alternatives', () => {
    const html = render('en', [ALT_ACTIVE, ALT_REMOVED, ALT_MERGED]);
    expect(html).toContain('disabled');
    expect(html).not.toContain(en['builder.noAlternatives']);
  });

  it('shows the unavailable badge on removed/merged targets and never substitutes', () => {
    const html = render('en', [ALT_ACTIVE, ALT_REMOVED, ALT_MERGED]);
    // Badge on the two unavailable rows, none on the active row.
    const badges = html.split(en['builder.alternativeUnavailable']).length - 1;
    expect(badges).toBe(2);
    // Unavailable entries stay listed under their own names; nothing is swapped in.
    const list = listSection(html);
    expect(list).toContain('Old Fly');
    expect(list).toContain('Local Dip');
    expect(list).toContain('Push-Up');
    expect(html).toContain(en['builder.removeAlternative']);
  });

  it('renders AR RTL with PO-approved badge copy', () => {
    const html = render('ar', [ALT_REMOVED, ALT_MERGED]);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain(ar['builder.alternatives']);
    expect(html).toContain(ar['builder.addAlternative']);
    expect(html).toContain(ar['builder.alternativeUnavailable']);
    const badges = html.split(ar['builder.alternativeUnavailable']).length - 1;
    expect(badges).toBe(2);
  });

  it('matches the PO-approved EN and AR alternatives strings exactly', () => {
    expect(en['builder.alternatives']).toBe('Manual alternatives');
    expect(en['builder.addAlternative']).toBe('Add alternative');
    expect(en['builder.alternativeExercise']).toBe('Alternative exercise');
    expect(en['builder.noAlternatives']).toBe('No alternatives.');
    expect(en['builder.removeAlternative']).toBe('Remove alternative');
    expect(en['builder.alternativeUnavailable']).toBe('Unavailable');

    expect(ar['builder.alternatives']).toBe('البدائل اليدوية');
    expect(ar['builder.addAlternative']).toBe('إضافة بديل');
    expect(ar['builder.alternativeExercise']).toBe('التمرين البديل');
    expect(ar['builder.noAlternatives']).toBe('لا توجد بدائل.');
    expect(ar['builder.removeAlternative']).toBe('إزالة البديل');
    expect(ar['builder.alternativeUnavailable']).toBe('مش متاح');
  });
});
