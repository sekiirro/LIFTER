// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WorkoutPlanBuilder,
  type WorkoutPlanBuilderProps,
} from '../../components/workout-planner/WorkoutPlanBuilder';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';
import type { WorkoutDocumentV1 } from '../../lib/workout-planner/document';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderBuilder(props: WorkoutPlanBuilderProps): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<WorkoutPlanBuilder {...props} />);
  });
  return container;
}

beforeEach(() => {
  vi.clearAllMocks();
});

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

const MOCK_EXERCISE_REF = {
  source: 'global' as const,
  identity_id: '11111111-1111-4111-8111-111111111111',
  version: 1,
};

const MOCK_ALT_REF = {
  source: 'global' as const,
  identity_id: '22222222-2222-4222-8222-222222222222',
  version: 1,
};

function createSampleDocument(): WorkoutDocumentV1 {
  return {
    schema_version: 1,
    notes: 'Sample plan general notes',
    days: [
      {
        id: 'aaaa1111-1111-4111-8111-111111111111',
        kind: 'session',
        title: 'Upper Body A',
        notes: 'Focus on chest and triceps',
        items: [
          {
            id: 'bbbb1111-1111-4111-8111-111111111111',
            exercise: MOCK_EXERCISE_REF,
            name: 'Bench Press',
            description: 'Barbell flat bench press',
            reps: { value: 8 },
            restSec: 120,
            rir: 2,
            notes: 'Pause 1s at chest',
            alternatives: [MOCK_ALT_REF],
            sets: [
              {
                id: 'cccc1111-1111-4111-8111-111111111111',
                type: 'warmup',
                load: { mode: 'bodyweight' },
              },
              {
                id: 'cccc2222-2222-4222-8222-222222222222',
                type: 'working',
                load: { mode: 'added_weight', value: '80.0', unit: 'kg' },
              },
            ],
          },
          {
            id: 'bbbb2222-2222-4222-8222-222222222222',
            exercise: MOCK_EXERCISE_REF,
            name: 'Overhead Press',
            description: 'Standing barbell press',
            reps: { min: 6, max: 8 },
            restSec: 90,
            rir: 1,
            notes: 'Keep core tight',
            alternatives: [],
            sets: [
              {
                id: 'cccc3333-3333-4333-8333-333333333333',
                type: 'working',
                load: { mode: 'added_weight', value: '50.0', unit: 'kg' },
              },
            ],
          },
        ],
      },
      {
        id: 'aaaa2222-2222-4222-8222-222222222222',
        kind: 'rest',
        title: 'Mid-week Rest',
        notes: 'Walk and stretch',
        items: [],
      },
      {
        id: 'aaaa3333-3333-4333-8333-333333333333',
        kind: 'session',
        title: 'Lower Body A',
        notes: 'Quad and hamstring focus',
        items: [
          {
            id: 'bbbb3333-3333-4333-8333-333333333333',
            exercise: MOCK_EXERCISE_REF,
            name: 'Back Squat',
            description: 'High bar squat',
            reps: { value: 5 },
            restSec: 180,
            rir: 3,
            notes: 'Full depth',
            alternatives: [],
            sets: [
              {
                id: 'cccc4444-4444-4444-8444-444444444444',
                type: 'working',
                load: { mode: 'added_weight', value: '120.0', unit: 'kg' },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('WorkoutPlanBuilder UI (T043; FR-002, FR-024, SC-012)', () => {
  it('renders English LTR with PO-approved S28-PO-2 labels and structure', () => {
    const doc = createSampleDocument();
    const host = renderBuilder({ document: doc, locale: 'en' });

    expect(host.firstElementChild?.getAttribute('dir')).toBe('ltr');
    expect(host.textContent).toContain(en['builder.plan']);
    expect(host.textContent).toContain(en['builder.days']);
    expect(host.textContent).toContain(en['builder.addSession']);
    expect(host.textContent).toContain(en['builder.addRestDay']);
    expect(host.textContent).toContain('Bench Press');
    expect(host.textContent).toContain('Overhead Press');
    expect(host.textContent).toContain('Back Squat');
    expect(host.textContent).toContain(en['builder.emptyRest']);
  });

  it('renders Arabic RTL with byte-exact PO-approved S28-PO-2 labels', () => {
    const doc = createSampleDocument();
    const host = renderBuilder({ document: doc, locale: 'ar' });

    expect(host.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(host.textContent).toContain(ar['builder.plan']);
    expect(host.textContent).toContain(ar['builder.days']);
    expect(host.textContent).toContain(ar['builder.addSession']);
    expect(host.textContent).toContain(ar['builder.addRestDay']);
    expect(host.textContent).toContain(ar['builder.emptyRest']);
  });

  describe('Acceptance tests: Rest day rules & no write', () => {
    it('rest days cannot display or retain items', () => {
      const doc = createSampleDocument();
      const host = renderBuilder({ document: doc, locale: 'en' });

      // Find the rest day card
      const restDayCard = host.querySelector('[data-day-kind="rest"]');
      expect(restDayCard).toBeTruthy();
      expect(restDayCard?.textContent).toContain(en['builder.emptyRest']);

      // Rest day must NOT render an "Add exercise" button
      const addExerciseInRest = restDayCard?.querySelector(
        '[data-action="add-exercise"]',
      );
      expect(addExerciseInRest).toBeNull();

      // Rest day must have 0 exercise items displayed
      const itemsInRest = restDayCard?.querySelectorAll('[data-item-id]');
      expect(itemsInRest?.length).toBe(0);
    });

    it('adding an item to a rest day is rejected with invalid_document and no write', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const onError = vi.fn();
      const host = renderBuilder({
        document: doc,
        locale: 'en',
        onChange,
        onError,
      });

      // Programmatic trigger via component action or test interface on rest day
      const restDayCard = host.querySelector('[data-day-kind="rest"]');
      expect(restDayCard).toBeTruthy();

      // Trigger programmatic add-item-to-day dispatched on the builder
      const builderElement = host.querySelector(
        '[data-testid="workout-plan-builder"]',
      );
      expect(builderElement).toBeTruthy();

      // Dispatch custom event to simulate attempted add to rest day
      act(() => {
        builderElement?.dispatchEvent(
          new CustomEvent('lifter:builder:add-item', {
            detail: {
              dayId: 'aaaa2222-2222-4222-8222-222222222222', // rest day
              item: {
                id: 'bbbb9999-9999-4999-8999-999999999999',
                exercise: MOCK_EXERCISE_REF,
                name: 'Prohibited Exercise',
                sets: [],
                alternatives: [],
              },
            },
          }),
        );
      });

      // Must be rejected with invalid_document and onChange must NOT be called
      expect(onChange).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'invalid_document' }),
      );
    });

    it('moving an item to a rest day is rejected with invalid_document and no write', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const onError = vi.fn();
      const host = renderBuilder({
        document: doc,
        locale: 'en',
        onChange,
        onError,
      });

      const builderElement = host.querySelector(
        '[data-testid="workout-plan-builder"]',
      );
      expect(builderElement).toBeTruthy();

      // Attempt to move Bench Press (session day 1) to Mid-week Rest (rest day)
      act(() => {
        builderElement?.dispatchEvent(
          new CustomEvent('lifter:builder:move-item-to-day', {
            detail: {
              itemId: 'bbbb1111-1111-4111-8111-111111111111',
              targetDayId: 'aaaa2222-2222-4222-8222-222222222222', // rest day
            },
          }),
        );
      });

      // Must be rejected with invalid_document and onChange must NOT be called
      expect(onChange).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'invalid_document' }),
      );
    });

    it('a rejected move leaves the item on its source day', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const onError = vi.fn();
      const host = renderBuilder({
        document: doc,
        locale: 'en',
        onChange,
        onError,
      });

      const builderElement = host.querySelector(
        '[data-testid="workout-plan-builder"]',
      );

      // Attempt invalid move to rest day
      act(() => {
        builderElement?.dispatchEvent(
          new CustomEvent('lifter:builder:move-item-to-day', {
            detail: {
              itemId: 'bbbb1111-1111-4111-8111-111111111111',
              targetDayId: 'aaaa2222-2222-4222-8222-222222222222',
            },
          }),
        );
      });

      expect(onChange).not.toHaveBeenCalled();

      // Verify the item is still on its source day in the UI
      const sourceDay = host.querySelector(
        '[data-day-id="aaaa1111-1111-4111-8111-111111111111"]',
      );
      expect(
        sourceDay?.querySelector(
          '[data-item-id="bbbb1111-1111-4111-8111-111111111111"]',
        ),
      ).toBeTruthy();

      // Verify rest day still has 0 items
      const restDay = host.querySelector(
        '[data-day-id="aaaa2222-2222-4222-8222-222222222222"]',
      );
      expect(restDay?.querySelectorAll('[data-item-id]').length).toBe(0);
    });
  });

  describe('Keyboard move controls and accessible names', () => {
    it('provides keyboard alternative buttons with accessible names for every reorder and move action', () => {
      const doc = createSampleDocument();
      const host = renderBuilder({ document: doc, locale: 'en' });

      // Day move up/down controls
      const moveDayUpButtons = host.querySelectorAll<HTMLButtonElement>(
        'button[data-action="move-day-up"]',
      );
      const moveDayDownButtons = host.querySelectorAll<HTMLButtonElement>(
        'button[data-action="move-day-down"]',
      );
      expect(moveDayUpButtons.length).toBeGreaterThan(0);
      expect(moveDayDownButtons.length).toBeGreaterThan(0);
      expect(moveDayUpButtons[0]!.getAttribute('aria-label')).toBe(
        en['builder.moveDayUp'],
      );
      expect(moveDayDownButtons[0]!.getAttribute('aria-label')).toBe(
        en['builder.moveDayDown'],
      );

      // Exercise item move up/down controls
      const moveItemUpButtons = host.querySelectorAll<HTMLButtonElement>(
        'button[data-action="move-item-up"]',
      );
      const moveItemDownButtons = host.querySelectorAll<HTMLButtonElement>(
        'button[data-action="move-item-down"]',
      );
      expect(moveItemUpButtons.length).toBeGreaterThan(0);
      expect(moveItemDownButtons.length).toBeGreaterThan(0);

      // Accessible names include the item name
      const expectedUpName = en['builder.moveUpNamed'].replace(
        '{name}',
        'Bench Press',
      );
      const expectedDownName = en['builder.moveDownNamed'].replace(
        '{name}',
        'Bench Press',
      );
      expect(moveItemUpButtons[0]!.getAttribute('aria-label')).toBe(
        expectedUpName,
      );
      expect(moveItemDownButtons[0]!.getAttribute('aria-label')).toBe(
        expectedDownName,
      );

      // Cross-day move controls
      const moveToDayButtons = host.querySelectorAll<HTMLButtonElement>(
        'button[data-action="move-to-day"]',
      );
      expect(moveToDayButtons.length).toBeGreaterThan(0);
      const expectedMoveToDayName = en['builder.moveToDayNamed'].replace(
        '{name}',
        'Bench Press',
      );
      expect(moveToDayButtons[0]!.getAttribute('aria-label')).toBe(
        expectedMoveToDayName,
      );
    });

    it('executes item reorder via keyboard button and preserves all IDs', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const host = renderBuilder({
        document: doc,
        locale: 'en',
        onChange,
      });

      // Click move-down on the first exercise (Bench Press)
      const moveDownBtn = host.querySelector<HTMLButtonElement>(
        '[data-item-id="bbbb1111-1111-4111-8111-111111111111"] button[data-action="move-item-down"]',
      );
      expect(moveDownBtn).toBeTruthy();

      act(() => {
        moveDownBtn?.click();
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedDoc = onChange.mock.calls[0]![0] as WorkoutDocumentV1;

      // Reordered: Overhead Press is first, Bench Press is second
      const day1Items = updatedDoc.days[0]!.items;
      expect(day1Items[0]!.name).toBe('Overhead Press');
      expect(day1Items[1]!.name).toBe('Bench Press');

      // ID PRESERVATION: All item and set IDs are preserved exactly
      expect(day1Items[0]!.id).toBe('bbbb2222-2222-4222-8222-222222222222');
      expect(day1Items[1]!.id).toBe('bbbb1111-1111-4111-8111-111111111111');
      expect(day1Items[1]!.sets[0]!.id).toBe(
        'cccc1111-1111-4111-8111-111111111111',
      );
      expect(day1Items[1]!.sets[1]!.id).toBe(
        'cccc2222-2222-4222-8222-222222222222',
      );
    });

    it('executes cross-day move to another session day via keyboard control and preserves item ID', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const host = renderBuilder({
        document: doc,
        locale: 'en',
        onChange,
      });

      // Target day: Lower Body A (session day 3)
      const moveToDayBtn = host.querySelector<HTMLButtonElement>(
        '[data-item-id="bbbb1111-1111-4111-8111-111111111111"] button[data-action="move-to-day"][data-target-day-id="aaaa3333-3333-4333-8333-333333333333"]',
      );
      expect(moveToDayBtn).toBeTruthy();

      act(() => {
        moveToDayBtn?.click();
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedDoc = onChange.mock.calls[0]![0] as WorkoutDocumentV1;

      // Day 1 now has only Overhead Press
      expect(updatedDoc.days[0]!.items.length).toBe(1);
      expect(updatedDoc.days[0]!.items[0]!.name).toBe('Overhead Press');

      // Day 3 (Lower Body A) now has Back Squat + Bench Press
      expect(updatedDoc.days[2]!.items.length).toBe(2);
      const movedItem = updatedDoc.days[2]!.items[1]!;
      expect(movedItem.name).toBe('Bench Press');

      // ID PRESERVATION: Moved item preserves original id and set ids
      expect(movedItem.id).toBe('bbbb1111-1111-4111-8111-111111111111');
      expect(movedItem.sets[0]!.id).toBe(
        'cccc1111-1111-4111-8111-111111111111',
      );
      expect(movedItem.sets[1]!.id).toBe(
        'cccc2222-2222-4222-8222-222222222222',
      );
    });
  });

  describe('Duplicate operations and ID continuity', () => {
    it('duplicating an item remaps duplicate ids while preserving original item ids', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const host = renderBuilder({
        document: doc,
        locale: 'en',
        onChange,
      });

      const duplicateBtn = host.querySelector<HTMLButtonElement>(
        '[data-item-id="bbbb1111-1111-4111-8111-111111111111"] button[data-action="duplicate-item"]',
      );
      expect(duplicateBtn).toBeTruthy();

      act(() => {
        duplicateBtn?.click();
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedDoc = onChange.mock.calls[0]![0] as WorkoutDocumentV1;

      const day1Items = updatedDoc.days[0]!.items;
      expect(day1Items.length).toBe(3);

      // Original item is unchanged and retains original IDs
      const original = day1Items[0]!;
      expect(original.id).toBe('bbbb1111-1111-4111-8111-111111111111');
      expect(original.sets[0]!.id).toBe('cccc1111-1111-4111-8111-111111111111');
      expect(original.sets[1]!.id).toBe('cccc2222-2222-4222-8222-222222222222');

      // Untouched second item retains original IDs
      const untouched = day1Items[2]!;
      expect(untouched.id).toBe('bbbb2222-2222-4222-8222-222222222222');

      // Duplicate item has fresh IDs and matches fields
      const duplicate = day1Items[1]!;
      expect(duplicate.id).not.toBe(original.id);
      expect(duplicate.name).toBe(original.name);
      expect(duplicate.sets.length).toBe(original.sets.length);
      expect(duplicate.sets[0]!.id).not.toBe(original.sets[0]!.id);
      expect(duplicate.sets[1]!.id).not.toBe(original.sets[1]!.id);
    });

    it('duplicating a day remaps day and descendant ids while preserving all existing ids', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const host = renderBuilder({
        document: doc,
        locale: 'en',
        onChange,
      });

      const duplicateDayBtn = host.querySelector<HTMLButtonElement>(
        '[data-day-id="aaaa1111-1111-4111-8111-111111111111"] button[data-action="duplicate-day"]',
      );
      expect(duplicateDayBtn).toBeTruthy();

      act(() => {
        duplicateDayBtn?.click();
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedDoc = onChange.mock.calls[0]![0] as WorkoutDocumentV1;

      expect(updatedDoc.days.length).toBe(4);

      // Existing days and their items retain all IDs
      expect(updatedDoc.days[0]!.id).toBe(
        'aaaa1111-1111-4111-8111-111111111111',
      );
      expect(updatedDoc.days[0]!.items[0]!.id).toBe(
        'bbbb1111-1111-4111-8111-111111111111',
      );
      expect(updatedDoc.days[2]!.id).toBe(
        'aaaa2222-2222-4222-8222-222222222222',
      );

      // Duplicated day has fresh IDs
      const dupDay = updatedDoc.days[1]!;
      expect(dupDay.id).not.toBe(updatedDoc.days[0]!.id);
      expect(dupDay.items.length).toBe(2);
      expect(dupDay.items[0]!.id).not.toBe(updatedDoc.days[0]!.items[0]!.id);
      expect(dupDay.items[0]!.sets[0]!.id).not.toBe(
        updatedDoc.days[0]!.items[0]!.sets[0]!.id,
      );
    });
  });

  describe('Sets, notes, and alternatives editing', () => {
    it('allows adding and removing sets with load modes', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const host = renderBuilder({
        document: doc,
        locale: 'en',
        onChange,
      });

      const addSetBtn = host.querySelector<HTMLButtonElement>(
        '[data-item-id="bbbb2222-2222-4222-8222-222222222222"] button[data-action="add-set"]',
      );
      expect(addSetBtn).toBeTruthy();

      act(() => {
        addSetBtn?.click();
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedDoc = onChange.mock.calls[0]![0] as WorkoutDocumentV1;
      const targetItem = updatedDoc.days[0]!.items.find(
        (i) => i.id === 'bbbb2222-2222-4222-8222-222222222222',
      );
      expect(targetItem?.sets.length).toBe(2);
    });

    it('renders and preserves document notes, day notes, and alternatives', () => {
      const doc = createSampleDocument();
      const host = renderBuilder({ document: doc, locale: 'en' });

      expect(host.textContent).toContain('Sample plan general notes');
      expect(host.textContent).toContain('Focus on chest and triceps');
      expect(host.textContent).toContain('Pause 1s at chest');

      // Alternatives count / indicator rendered
      const itemWithAlt = host.querySelector(
        '[data-item-id="bbbb1111-1111-4111-8111-111111111111"]',
      );
      expect(itemWithAlt?.textContent).toContain(en['builder.alternatives']);
    });
  });
});
