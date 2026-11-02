import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkoutBuilder } from '../../components/plans/workout/WorkoutBuilder';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { createWorkoutBuilderFixture } from '../../lib/plans/workout/builder-fixtures';

function render(locale: Locale): string {
  return renderToStaticMarkup(
    createElement(WorkoutBuilder, {
      locale,
      messages: getMessages(locale),
      fixture: createWorkoutBuilderFixture(locale),
    }),
  );
}

describe('formatDigits', () => {
  it('maps Latin digits to Arabic-Indic for Arabic and leaves English untouched', async () => {
    const { formatDigits } = await import('../../lib/i18n/format-digits');
    expect(formatDigits('10', 'ar')).toBe('١٠');
    expect(formatDigits('22.5', 'ar')).toBe('٢٢.٥');
    expect(formatDigits(120, 'ar')).toBe('١٢٠');
    expect(formatDigits('10', 'en')).toBe('10');
    expect(formatDigits('22.5', 'en')).toBe('22.5');
  });
});

describe('WorkoutBuilder digits', () => {
  it('renders Arabic-Indic digits for ordinals, reps, load, rest, and RIR in Arabic', () => {
    const html = render('ar');

    expect(html).toMatch(/<span class="_dayNumber_[^"]*">١<\/span>/);
    expect(html).toMatch(/<span class="_itemIndex_[^"]*">١<\/span>/);
    expect(html).toContain('المجموعة ١');
    expect(html).toContain('المجموعة ٢');

    expect(html).toContain('value="١٠"');
    expect(html).toContain('value="٨"');
    expect(html).toContain('value="٢٢.٥"');
    expect(html).toContain('value="٤٥"');
    expect(html).toContain('value="١٢٠"');
    expect(html).toContain('value="٢"');

    expect(html).not.toContain('value="22.5"');
    expect(html).not.toContain('value="120"');
  });

  it('renders Latin digits in English', () => {
    const html = render('en');

    expect(html).toMatch(/<span class="_dayNumber_[^"]*">1<\/span>/);
    expect(html).toMatch(/<span class="_itemIndex_[^"]*">1<\/span>/);
    expect(html).toContain('Set 1');
    expect(html).toContain('Set 2');

    expect(html).toContain('value="10"');
    expect(html).toContain('value="8"');
    expect(html).toContain('value="22.5"');
    expect(html).toContain('value="45"');
    expect(html).toContain('value="120"');
    expect(html).toContain('value="2"');

    expect(html).not.toContain('value="١٠"');
  });

  it('labels the rest field with the approved noun and unit', () => {
    const ar = render('ar');
    const en = render('en');

    expect(ar).toContain('مدة الراحة (بالثواني)');
    expect(en).toContain('Rest (seconds)');
  });
});
