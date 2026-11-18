import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { WorkoutPrintView } from '../../components/workout-planner/WorkoutPrintView';
import {
  buildClientWorkoutPayload,
  projectClientWorkoutPlan,
} from '../../lib/workout-planner/client-projection';
import {
  BENCH_URL,
  PLAN_ID,
  PRIVATE_URL,
  rawOk,
} from './client-workout-fixture';

// F22 T017 (FR-004; S57-PO-9): the shared F17 read-only print view renders a
// client projection with no second renderer, in both locales.
function payload(locale: 'en' | 'ar') {
  const result = projectClientWorkoutPlan(rawOk(), {
    planId: PLAN_ID,
    revisionNumber: 2,
  });
  if (result.status !== 'ok') throw new Error('projection');
  return buildClientWorkoutPayload(result.projection, locale);
}

describe('client workout print view reuse', () => {
  it.each(['en', 'ar'] as const)(
    'renders names, live videos, notes and alternatives from the projection (%s)',
    (locale) => {
      const html = renderToStaticMarkup(
        <WorkoutPrintView payload={payload(locale)} locale={locale} />,
      );
      expect(html).toContain('Bench Press');
      expect(html).toContain('Dumbbell Press');
      expect(html).toContain('Coach Private Press');
      expect(html).toContain(BENCH_URL);
      expect(html).toContain(PRIVATE_URL);
      expect(html).toContain('Pause on chest');
      expect(html).toContain(locale === 'ar' ? 'dir="rtl"' : 'dir="ltr"');
    },
  );

  it('contains nothing but the projection: no ids, workspace or staff attribution', () => {
    const html = renderToStaticMarkup(
      <WorkoutPrintView payload={payload('en')} locale="en" />,
    );
    for (const forbidden of [
      '00000000-0000-4000-8000',
      'workspace',
      'authored_by',
      'created_by',
    ])
      expect(html).not.toContain(forbidden);
  });
});
