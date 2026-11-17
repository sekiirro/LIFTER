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

function fireChange(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
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

  describe('Editable fields (Slice 2: notes, reps, set values/load/rest/RIR, day title/kind)', () => {
    it('allows editing plan notes', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const host = renderBuilder({ document: doc, locale: 'en', onChange });

      const planNotesInput = host.querySelector<HTMLTextAreaElement>(
        '[data-field="plan-notes"]',
      );
      expect(planNotesInput).toBeTruthy();
      expect(planNotesInput?.value).toBe('Sample plan general notes');

      act(() => {
        if (planNotesInput) {
          fireChange(planNotesInput, 'Updated plan notes by coach');
        }
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedDoc = onChange.mock.calls[0]![0] as WorkoutDocumentV1;
      expect(updatedDoc.notes).toBe('Updated plan notes by coach');
    });

    it('allows editing day title and day notes', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const host = renderBuilder({ document: doc, locale: 'en', onChange });

      const dayCard = host.querySelector(
        '[data-day-id="aaaa1111-1111-4111-8111-111111111111"]',
      );
      expect(dayCard).toBeTruthy();

      const dayTitleInput = dayCard?.querySelector<HTMLInputElement>(
        '[data-field="day-title"]',
      );
      expect(dayTitleInput).toBeTruthy();
      expect(dayTitleInput?.value).toBe('Upper Body A');

      act(() => {
        if (dayTitleInput) {
          fireChange(dayTitleInput, 'Chest & Shoulders Heavy');
        }
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0]![0].days[0].title).toBe(
        'Chest & Shoulders Heavy',
      );

      const dayNotesInput = dayCard?.querySelector<HTMLInputElement>(
        '[data-field="day-notes"]',
      );
      expect(dayNotesInput).toBeTruthy();
      expect(dayNotesInput?.value).toBe('Focus on chest and triceps');

      act(() => {
        if (dayNotesInput) {
          fireChange(dayNotesInput, 'Warm up rotator cuffs thoroughly');
        }
      });

      expect(onChange).toHaveBeenCalledTimes(2);
      expect(onChange.mock.calls[1]![0].days[0].notes).toBe(
        'Warm up rotator cuffs thoroughly',
      );
    });

    it('allows editing day kind and rejects converting a session day with items to rest day', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const onError = vi.fn();
      const host = renderBuilder({
        document: doc,
        locale: 'en',
        onChange,
        onError,
      });

      // Day 1 has 2 items -> switching kind to rest must reject with invalid_document
      const day1Card = host.querySelector(
        '[data-day-id="aaaa1111-1111-4111-8111-111111111111"]',
      );
      const day1KindSelect = day1Card?.querySelector<HTMLSelectElement>(
        '[data-field="day-kind"]',
      );
      expect(day1KindSelect).toBeTruthy();
      expect(day1KindSelect?.value).toBe('session');

      act(() => {
        if (day1KindSelect) {
          fireChange(day1KindSelect, 'rest');
        }
      });

      expect(onChange).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect((onError.mock.calls[0]![0] as Error).message).toBe(
        'invalid_document',
      );

      // Now add a blank session day and switch it to rest -> should succeed
      const addSessionBtn = Array.from(
        host.querySelectorAll<HTMLButtonElement>('header button'),
      ).find((b) => b.textContent?.includes(en['builder.addSession']));
      expect(addSessionBtn).toBeTruthy();
      act(() => {
        addSessionBtn?.click();
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      const docWithEmptySession = onChange.mock
        .calls[0]![0] as WorkoutDocumentV1;
      const emptyDay =
        docWithEmptySession.days[docWithEmptySession.days.length - 1]!;
      expect(emptyDay.kind).toBe('session');
      expect(emptyDay.items.length).toBe(0);

      // Re-render with new doc containing empty session day
      onChange.mockClear();
      onError.mockClear();
      const updatedHost = renderBuilder({
        document: docWithEmptySession,
        locale: 'en',
        onChange,
        onError,
      });

      const emptyDayCard = updatedHost.querySelector(
        `[data-day-id="${emptyDay.id}"]`,
      );
      const emptyDayKindSelect = emptyDayCard?.querySelector<HTMLSelectElement>(
        '[data-field="day-kind"]',
      );
      expect(emptyDayKindSelect).toBeTruthy();

      act(() => {
        if (emptyDayKindSelect) {
          fireChange(emptyDayKindSelect, 'rest');
        }
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const docAfterKindChange = onChange.mock
        .calls[0]![0] as WorkoutDocumentV1;
      const changedDay = docAfterKindChange.days.find(
        (d) => d.id === emptyDay.id,
      );
      expect(changedDay?.kind).toBe('rest');
    });

    it('allows editing exercise notes, rest, and RIR with document validator bounds', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const onError = vi.fn();
      const host = renderBuilder({
        document: doc,
        locale: 'en',
        onChange,
        onError,
      });

      const itemCard = host.querySelector(
        '[data-item-id="bbbb1111-1111-4111-8111-111111111111"]',
      );
      expect(itemCard).toBeTruthy();

      // Edit exercise notes
      const notesInput = itemCard?.querySelector<HTMLInputElement>(
        '[data-field="item-notes"]',
      );
      expect(notesInput).toBeTruthy();
      expect(notesInput?.value).toBe('Pause 1s at chest');

      act(() => {
        if (notesInput) {
          fireChange(notesInput, 'Control the eccentric phase');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0]![0].days[0].items[0].notes).toBe(
        'Control the eccentric phase',
      );

      // Edit restSec (multiple of 15)
      const restInput = itemCard?.querySelector<HTMLInputElement>(
        '[data-field="item-rest"]',
      );
      expect(restInput).toBeTruthy();
      expect(restInput?.value).toBe('120');

      act(() => {
        if (restInput) {
          fireChange(restInput, '90');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(onChange.mock.calls[1]![0].days[0].items[0].restSec).toBe(90);

      // Invalid restSec (e.g. 95 not divisible by 15) rejected via validator (S60-D3)
      act(() => {
        if (restInput) {
          fireChange(restInput, '95');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(2); // no new write
      expect(onError).toHaveBeenCalledWith(expect.any(Error));

      // Edit RIR (0 to 5)
      const rirInput = itemCard?.querySelector<HTMLInputElement>(
        '[data-field="item-rir"]',
      );
      expect(rirInput).toBeTruthy();
      expect(rirInput?.value).toBe('2');

      act(() => {
        if (rirInput) {
          fireChange(rirInput, '3');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(3);
      expect(onChange.mock.calls[2]![0].days[0].items[0].rir).toBe(3);

      // Invalid RIR (> 5) rejected via validator (S60-D3)
      act(() => {
        if (rirInput) {
          fireChange(rirInput, '7');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(3);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('allows editing exercise reps in fixed mode and range mode with bounds validation', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const onError = vi.fn();
      const host = renderBuilder({
        document: doc,
        locale: 'en',
        onChange,
        onError,
      });

      // Item 1 has fixed reps { value: 8 }
      const item1Card = host.querySelector(
        '[data-item-id="bbbb1111-1111-4111-8111-111111111111"]',
      );
      const repsModeSelect = item1Card?.querySelector<HTMLSelectElement>(
        '[data-field="reps-mode"]',
      );
      expect(repsModeSelect).toBeTruthy();
      expect(repsModeSelect?.value).toBe('fixed');

      const repsValueInput = item1Card?.querySelector<HTMLInputElement>(
        '[data-field="reps-value"]',
      );
      expect(repsValueInput).toBeTruthy();
      expect(repsValueInput?.value).toBe('8');

      act(() => {
        if (repsValueInput) {
          fireChange(repsValueInput, '10');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0]![0].days[0].items[0].reps).toEqual({
        value: 10,
      });

      // Switch to range mode
      act(() => {
        if (repsModeSelect) {
          fireChange(repsModeSelect, 'range');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(onChange.mock.calls[1]![0].days[0].items[0].reps).toEqual({
        min: 8,
        max: 10,
      });

      // Item 2 has range reps { min: 6, max: 8 }
      const item2Card = host.querySelector(
        '[data-item-id="bbbb2222-2222-4222-8222-222222222222"]',
      );
      const minInput = item2Card?.querySelector<HTMLInputElement>(
        '[data-field="reps-min"]',
      );
      const maxInput = item2Card?.querySelector<HTMLInputElement>(
        '[data-field="reps-max"]',
      );
      expect(minInput?.value).toBe('6');
      expect(maxInput?.value).toBe('8');

      // Edit min to 5
      act(() => {
        if (minInput) {
          fireChange(minInput, '5');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(3);
      expect(onChange.mock.calls[2]![0].days[0].items[1].reps).toEqual({
        min: 5,
        max: 8,
      });

      // Invalid range: min > max (e.g. min 12, max 8) rejected by validator (S60-D3)
      act(() => {
        if (minInput) {
          fireChange(minInput, '12');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(3); // no write
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('allows editing set type (warmup/working) and set load modes (bodyweight/added_weight/assisted)', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const onError = vi.fn();
      const host = renderBuilder({
        document: doc,
        locale: 'en',
        onChange,
        onError,
      });

      // Target set 1: id 'cccc1111-1111-4111-8111-111111111111' (warmup, bodyweight)
      const set1Row = host.querySelector(
        'tr[data-set-id="cccc1111-1111-4111-8111-111111111111"]',
      );
      expect(set1Row).toBeTruthy();

      // Change set type from warmup to working
      const setTypeSelect = set1Row?.querySelector<HTMLSelectElement>(
        '[data-field="set-type"]',
      );
      expect(setTypeSelect).toBeTruthy();
      expect(setTypeSelect?.value).toBe('warmup');

      act(() => {
        if (setTypeSelect) {
          fireChange(setTypeSelect, 'working');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0]![0].days[0].items[0].sets[0].type).toBe(
        'working',
      );

      // Change load mode from bodyweight to added_weight
      const loadModeSelect = set1Row?.querySelector<HTMLSelectElement>(
        '[data-field="load-mode"]',
      );
      expect(loadModeSelect).toBeTruthy();
      expect(loadModeSelect?.value).toBe('bodyweight');

      act(() => {
        if (loadModeSelect) {
          fireChange(loadModeSelect, 'added_weight');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(
        onChange.mock.calls[1]![0].days[0].items[0].sets[0].load.mode,
      ).toBe('added_weight');

      // Now target set 2: id 'cccc2222-2222-4222-8222-222222222222' (added_weight 80.0 kg)
      const set2Row = host.querySelector(
        'tr[data-set-id="cccc2222-2222-4222-8222-222222222222"]',
      );
      const loadValueInput = set2Row?.querySelector<HTMLInputElement>(
        '[data-field="load-value"]',
      );
      const loadUnitSelect = set2Row?.querySelector<HTMLSelectElement>(
        '[data-field="load-unit"]',
      );
      expect(loadValueInput?.value).toBe('80.0');
      expect(loadUnitSelect?.value).toBe('kg');

      // Edit value and unit
      act(() => {
        if (loadValueInput) {
          fireChange(loadValueInput, '92.5');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(3);
      expect(onChange.mock.calls[2]![0].days[0].items[0].sets[1].load).toEqual({
        mode: 'added_weight',
        value: '92.5',
        unit: 'kg',
      });

      // Switch load mode to assisted
      const set2LoadModeSelect = set2Row?.querySelector<HTMLSelectElement>(
        '[data-field="load-mode"]',
      );
      act(() => {
        if (set2LoadModeSelect) {
          fireChange(set2LoadModeSelect, 'assisted');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(4);
      expect(
        onChange.mock.calls[3]![0].days[0].items[0].sets[1].load.mode,
      ).toBe('assisted');

      // Invalid load value (e.g. 0 or negative) rejected by validator (S60-D3)
      act(() => {
        if (loadValueInput) {
          fireChange(loadValueInput, '0');
        }
      });
      expect(onChange).toHaveBeenCalledTimes(4); // no write
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('allows removing an alternative from an exercise item', () => {
      const doc = createSampleDocument();
      const onChange = vi.fn();
      const host = renderBuilder({ document: doc, locale: 'en', onChange });

      const itemWithAlt = host.querySelector(
        '[data-item-id="bbbb1111-1111-4111-8111-111111111111"]',
      );
      const removeAltBtn = itemWithAlt?.querySelector<HTMLButtonElement>(
        'button[data-action="remove-alternative"]',
      );
      expect(removeAltBtn).toBeTruthy();

      act(() => {
        removeAltBtn?.click();
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedItem = onChange.mock.calls[0]![0].days[0].items[0];
      expect(updatedItem.alternatives.length).toBe(0);
    });

    it('renders all editable field labels with byte-exact approved Arabic translations in RTL', () => {
      const doc = createSampleDocument();
      const host = renderBuilder({ document: doc, locale: 'ar' });

      // Plan notes placeholder / label
      const planNotes = host.querySelector<HTMLTextAreaElement>(
        '[data-field="plan-notes"]',
      );
      expect(planNotes?.getAttribute('aria-label')).toBe(
        ar['builder.planNotes'],
      );

      // Day title & notes
      const dayTitle = host.querySelector<HTMLInputElement>(
        '[data-field="day-title"]',
      );
      expect(dayTitle?.getAttribute('aria-label')).toBe(ar['builder.dayTitle']);

      const dayNotes = host.querySelector<HTMLInputElement>(
        '[data-field="day-notes"]',
      );
      expect(dayNotes?.getAttribute('aria-label')).toBe(ar['builder.dayNotes']);

      // Reps mode options
      const repsMode = host.querySelector<HTMLSelectElement>(
        '[data-field="reps-mode"]',
      );
      expect(repsMode?.textContent).toContain(ar['builder.fixedReps']);
      expect(repsMode?.textContent).toContain(ar['builder.repRange']);

      // Load mode options
      const loadMode = host.querySelector<HTMLSelectElement>(
        '[data-field="load-mode"]',
      );
      expect(loadMode?.textContent).toContain(ar['builder.bodyweight']);
      expect(loadMode?.textContent).toContain(ar['builder.load']);
      expect(loadMode?.textContent).toContain(ar['builder.assisted']);

      // Set type options
      const setType = host.querySelector<HTMLSelectElement>(
        '[data-field="set-type"]',
      );
      expect(setType?.textContent).toContain(ar['builder.warmup']);
      expect(setType?.textContent).toContain(ar['builder.working']);
    });
  });
});
