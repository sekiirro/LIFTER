import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryPrescriptionFields } from '../../components/workout-planner/EntryPrescriptionFields';
import type { Locale } from '../../lib/design/preferences';
import { formatUiNumber } from '../../lib/i18n/format-digits';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';
import {
  parseWorkoutDocumentV1,
  type WorkoutDocumentV1,
} from '../../lib/workout-planner/document';
import {
  resolveWorkoutExercise,
  type WorkoutEntryAtAdd,
} from '../../lib/workout-planner/exercise-resolution';
import type { EntryPrescriptions } from '../../lib/workout-planner/entry-prescriptions';

const uuid = (tail: string) =>
  `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const DAY_ID = uuid('2');
const ITEM_ID = uuid('3');
const REF = { source: 'global' as const, identity_id: uuid('1'), version: 2 };

/** The plan item's prescriptions: the only fields this UI owns. */
function prescriptionsOf(item: Record<string, unknown>): EntryPrescriptions {
  const entry: EntryPrescriptions = {};
  if (typeof item.restSec === 'number') entry.restSec = item.restSec;
  if (typeof item.rir === 'number') entry.rir = item.rir;
  if (item.reps !== undefined)
    entry.reps = item.reps as EntryPrescriptions['reps'];
  if (typeof item.notes === 'string') entry.notes = item.notes;
  return entry;
}

/** The F16 library defaults, copied at add time by the merged resolver. */
function addTimeEntry(defaults: {
  default_rest_time?: number;
  default_rir?: number;
  default_reps?: unknown;
}): EntryPrescriptions {
  const { entry }: { entry: WorkoutEntryAtAdd } = resolveWorkoutExercise({
    reference: REF,
    effectiveFields: { name: 'Squat', alternatives: [], ...defaults },
    authoring: 'workspace',
    resolutionScope: 'workspace',
    pinnedVersion: {
      identity_id: uuid('1'),
      version: 2,
      primary_muscle_code: 'quads',
    },
  });
  return prescriptionsOf(entry);
}

/** Build and validate the plan document that holds one entry. */
function saveDraft(entry: EntryPrescriptions): WorkoutDocumentV1 {
  return parseWorkoutDocumentV1({
    schema_version: 1,
    days: [
      {
        id: DAY_ID,
        kind: 'session',
        items: [
          {
            id: ITEM_ID,
            exercise: REF,
            name: 'Squat',
            alternatives: [],
            sets: [],
            ...entry,
          },
        ],
      },
    ],
  });
}

/** The load path: the saved draft is parsed back and never re-defaulted. */
function loadItem(document: WorkoutDocumentV1): EntryPrescriptions {
  const loaded = parseWorkoutDocumentV1(JSON.parse(JSON.stringify(document)));
  return prescriptionsOf(loaded.days[0]!.items[0]!);
}

function Harness({
  locale,
  initial,
  onEntry,
}: {
  locale: Locale;
  initial: EntryPrescriptions;
  onEntry: (entry: EntryPrescriptions) => void;
}) {
  const [entry, setEntry] = useState(initial);
  return createElement(EntryPrescriptionFields, {
    locale,
    value: entry,
    onChange: (next: EntryPrescriptions) => {
      onEntry(next);
      setEntry(next);
    },
  });
}

let dom: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  dom = new Window();
  vi.stubGlobal('window', dom);
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('HTMLElement', dom.HTMLElement);
  vi.stubGlobal('HTMLInputElement', dom.HTMLInputElement);
  vi.stubGlobal('Event', dom.Event);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const element = dom.document.createElement('div');
  dom.document.body.append(element);
  container = element as unknown as HTMLElement;
  root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.happyDOM.abort();
  vi.unstubAllGlobals();
});

async function mount(element: ReturnType<typeof createElement>) {
  await act(async () => root.render(element));
}

function field(name: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(
    `input[id$="-${name}"]`,
  );
  expect(element, name).not.toBeNull();
  return element!;
}

function reactProps(element: HTMLElement): {
  onChange?: (event: { currentTarget: HTMLElement }) => void;
} {
  const key = Object.keys(element).find((name) =>
    name.startsWith('__reactProps'),
  );
  expect(key, 'react props').toBeDefined();
  return (
    element as unknown as Record<
      string,
      { onChange?: (event: { currentTarget: HTMLElement }) => void }
    >
  )[key!]!;
}

async function type(name: string, value: string) {
  const input = field(name);
  const setter = Object.getOwnPropertyDescriptor(
    dom.HTMLInputElement.prototype,
    'value',
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    reactProps(input).onChange?.({ currentTarget: input });
  });
}

async function choose(name: string, value: string) {
  const radio = container.querySelector<HTMLInputElement>(
    `input[type="radio"][value="${value}"]`,
  );
  expect(radio, name).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(
    dom.HTMLInputElement.prototype,
    'checked',
  )!.set!;
  await act(async () => {
    setter.call(radio!, true);
    reactProps(radio!).onChange?.({ currentTarget: radio! });
  });
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('F17 default copy/override UI (T033; FR-004, FR-005; SC-001)', () => {
  it('shows the add-time copied Rest, RIR and Reps as ordinary editable fields', () => {
    const entry = addTimeEntry({
      default_rest_time: 90,
      default_rir: 2,
      default_reps: { kind: 'fixed', value: 10 },
    });
    const html = renderToStaticMarkup(
      createElement(EntryPrescriptionFields, {
        locale: 'en',
        value: entry,
        onChange: () => {},
      }),
    );

    expect(html).toContain(en['builder.restHint']);
    expect(html).toContain(en['builder.rirHint']);
    expect(html).toContain(en['builder.reps']);
    expect(html).toContain('value="90"');
    expect(html).toContain('value="2"');
    expect(html).toContain('value="10"');

    // Ordinary editable fields: nothing read-only or disabled.
    expect(html).not.toContain('readonly');
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('aria-readonly');
  });

  it('renders Arabic RTL fields with the approved labels and Arabic-Indic digits', () => {
    const entry = addTimeEntry({
      default_rest_time: 120,
      default_rir: 1,
      default_reps: { kind: 'range', min: 8, max: 12 },
    });
    const html = renderToStaticMarkup(
      createElement(EntryPrescriptionFields, {
        locale: 'ar',
        value: entry,
        onChange: () => {},
      }),
    );

    expect(html).toContain('dir="rtl"');
    expect(html).toContain(ar['builder.restHint']);
    expect(html).toContain(ar['builder.rirHint']);
    expect(html).toContain(ar['builder.repsMode']);
    expect(html).toContain(ar['builder.repRange']);
    expect(html).toContain(ar['builder.min']);
    expect(html).toContain(ar['builder.max']);
    for (const number of [120, 1, 8, 12]) {
      expect(html).toContain(`value="${formatUiNumber(number, 'ar')}"`);
    }
    expect(html).not.toContain('value="120"');
    expect(formatUiNumber(120, 'ar')).not.toBe('120');
  });

  it('edits the copied values through the ordinary inputs', async () => {
    let latest: EntryPrescriptions = addTimeEntry({
      default_rest_time: 90,
      default_rir: 2,
      default_reps: { kind: 'fixed', value: 10 },
    });
    await mount(
      createElement(Harness, {
        locale: 'en',
        initial: latest,
        onEntry: (next: EntryPrescriptions) => {
          latest = next;
        },
      }),
    );

    await type('rest', '45');
    await type('rir', '3');
    await type('reps-value', '12');

    expect(latest.restSec).toBe(45);
    expect(latest.rir).toBe(3);
    expect(latest.reps).toEqual({ value: 12 });

    // The edited values are valid under the merged document validator.
    const saved = saveDraft(latest);
    expect(saved.days[0]!.items[0]!.restSec).toBe(45);
  });

  it('never re-applies library defaults when a saved draft is loaded', async () => {
    let entry: EntryPrescriptions = addTimeEntry({
      default_rest_time: 90,
      default_rir: 2,
      default_reps: { kind: 'fixed', value: 10 },
    });
    await mount(
      createElement(Harness, {
        locale: 'en',
        initial: entry,
        onEntry: (next: EntryPrescriptions) => {
          entry = next;
        },
      }),
    );

    await type('rest', '45');
    await type('rir', '1');
    await choose('reps-mode', 'range');
    await type('reps-min', '5');
    await type('reps-max', '8');

    const loaded = loadItem(saveDraft(entry));
    expect(loaded.restSec).toBe(45);
    expect(loaded.rir).toBe(1);
    expect(loaded.reps).toEqual({ min: 5, max: 8 });

    // Reopen the loaded draft: the edited values stay and the library defaults
    // (90 / 2 / 10) never come back.
    await mount(
      createElement(Harness, {
        locale: 'en',
        initial: loaded,
        onEntry: () => {},
      }),
    );
    expect(field('rest').value).toBe('45');
    expect(field('rir').value).toBe('1');
    expect(field('reps-min').value).toBe('5');
    expect(field('reps-max').value).toBe('8');
    expect(container.textContent).not.toContain('90');
    expect(container.textContent).not.toContain('10');
  });

  it('leaves an absent library default blank instead of inventing a value', () => {
    const entry = addTimeEntry({});
    expect(entry.restSec).toBeUndefined();
    expect(entry.rir).toBeUndefined();
    expect(entry.reps).toBeUndefined();
    const html = renderToStaticMarkup(
      createElement(EntryPrescriptionFields, {
        locale: 'en',
        value: entry,
        onChange: () => {},
      }),
    );
    expect(html).toContain('value=""');
  });

  it('offers no platform-defaults control and keeps no defaults source', () => {
    const html = renderToStaticMarkup(
      createElement(EntryPrescriptionFields, {
        locale: 'en',
        value: addTimeEntry({
          default_rest_time: 90,
          default_rir: 2,
          default_reps: { kind: 'fixed', value: 10 },
        }),
        onChange: () => {},
      }),
    );
    const text = visibleText(html);
    expect(text).not.toMatch(/default/i);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<form');

    const source = readFileSync(
      'components/workout-planner/EntryPrescriptionFields.tsx',
      'utf8',
    );
    // No catalog read and no effect hook: nothing can replay a library default.
    expect(source).not.toMatch(/lib\/catalog/);
    expect(source).not.toMatch(/useEffect/);
  });
});
