import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CatalogListShell } from '../../components/catalog/CatalogListShell';
import { mockExerciseItems, mockFoodItems } from '../../lib/catalog/mock';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

function render(props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(CatalogListShell, {
      locale: 'ar',
      kind: 'exercise',
      items: mockExerciseItems,
      ...props,
    }),
  );
}

describe('catalog list shell presentation', () => {
  it('renders Arabic-first RTL markup with localized copy', () => {
    const html = render();
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain('data-catalog-locale="ar"');
    expect(html).toContain(ar['catalog.exerciseTitle']);
    expect(html).toContain(ar['catalog.searchLabel']);
    expect(html).toContain(ar['catalog.filters']);
  });

  it('renders English LTR markup with English copy', () => {
    const html = render({ locale: 'en' });
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
    expect(html).toContain('data-catalog-locale="en"');
    expect(html).toContain(en['catalog.exerciseTitle']);
    expect(html).toContain(en['catalog.searchLabel']);
    expect(html).not.toContain(ar['catalog.exerciseTitle']);
  });

  it('exposes a labeled, keyboard-submittable search form', () => {
    const html = render({ locale: 'en' });
    expect(html).toContain('role="search"');
    expect(html).toContain('type="submit"');
    expect(html).toContain('name="q"');
    expect(html).toContain('type="search"');
    expect(html).toMatch(/enterKeyHint="search"|enterkeyhint="search"/i);

    const labelFor = html.match(/<label for="([^"]+)">[^<]*<\/label>/)?.[1];
    expect(labelFor).toBeTruthy();
    expect(html).toContain(`id="${labelFor}"`);
    expect(html).toContain(en['catalog.searchSubmit']);
    expect(html).toContain(en['catalog.clear']);
  });

  it('renders accessible filter controls for exercise taxonomy', () => {
    const html = render({ locale: 'en' });
    expect(html).toContain('<fieldset');
    expect(html).toContain(en['catalog.filterMuscle']);
    expect(html).toContain(en['catalog.filterEquipment']);
    expect(html).toMatch(
      new RegExp(`<option value=""[^>]*>${en['catalog.all']}</option>`),
    );
    expect(html).toContain('<option value="chest">Chest</option>');
    expect(html).toContain('<option value="barbell">Barbell</option>');
  });

  it('lists active items only and renders canonical taxonomy as LTR data', () => {
    const html = render({ locale: 'en' });
    expect(html).toContain('Barbell Bench Press');
    expect(html).toContain('Lat Pulldown');
    expect(html).toContain('Push-Up');
    expect(html).not.toContain('Archived Curl');
    expect(html).not.toContain('Archived Squat');
    expect(html).toContain('<bdi dir="ltr">Chest</bdi>');
    expect(html).toContain('<bdi dir="ltr">Barbell</bdi>');
    expect(html).toContain(en['catalog.primaryMuscle']);
    expect(html).toContain(en['catalog.equipment']);
  });

  it('renders food nutrition with LTR numeric data and a basis filter', () => {
    const html = render({
      locale: 'en',
      kind: 'food',
      items: mockFoodItems,
    });
    expect(html).toContain('data-catalog-kind="food"');
    expect(html).toContain(en['catalog.foodTitle']);
    expect(html).toContain(en['catalog.filterBasis']);
    expect(html).toContain('Chicken Breast');
    expect(html).toContain('<bdi dir="ltr">165</bdi>');
    expect(html).toContain('<bdi dir="ltr">31</bdi>');
    expect(html).toContain(en['catalog.kcal']);
    expect(html).toContain(en['catalog.protein']);
  });

  it('renders a loading skeleton without leaking item names', () => {
    const html = render({ status: 'loading' });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(ar['catalog.loading']);
    expect(html).not.toContain('ضغط الصدر بالبار');
    expect(html).not.toContain('data-testid="catalog-list"');
  });

  it('renders the empty state when the projection has no items', () => {
    const html = render({ items: [] });
    expect(html).toContain(ar['catalog.emptyTitle']);
    expect(html).toContain(ar['catalog.emptyDescription']);
    expect(html).not.toContain('data-testid="catalog-list"');
  });

  it('renders exercise rows and offers manual Add in the empty state', () => {
    const rows = render({ locale: 'en', items: mockExerciseItems });
    expect(rows).toContain('Barbell Bench Press');
    const empty = render({
      locale: 'en',
      items: [],
      emptyActionHref: '/exercise-library/new',
      emptyActionLabel: 'Add exercise',
    });
    expect(empty).toContain('href="/exercise-library/new"');
    expect(empty).toContain('Add exercise');
  });

  it('does not re-filter a server-filtered exercise page on the client', () => {
    const row = {
      id: 'server-match',
      kind: 'exercise' as const,
      names: {
        ar: '\u0627\u062E\u062A\u0628\u0627\u0631',
        en: 'Server matched row',
      },
      primaryMuscle: 'chest' as const,
      equipment: 'barbell' as const,
      lifecycleState: 'active' as const,
    };
    const html = render({
      locale: 'en',
      items: [row],
      serverFiltered: true,
      initialFilters: { equipment: 'dumbbell' },
    });
    expect(html).toContain('Server matched row');
  });

  it('renders the no-results state when the submitted search matches nothing', () => {
    const html = render({ initialQuery: 'zzzz-no-match' });
    expect(html).toContain(ar['catalog.noResultsTitle']);
    expect(html).toContain(ar['catalog.noResultsDescription']);
    expect(html).not.toContain('data-testid="catalog-list"');
  });

  it('renders no-results when the server returns no rows for an active filter', () => {
    const html = render({
      items: [],
      initialFilters: { muscleGroup: 'chest' },
    });
    expect(html).toContain(ar['catalog.noResultsTitle']);
    expect(html).not.toContain(ar['catalog.emptyTitle']);
  });

  it('renders a safe retryable error without item data', () => {
    const html = render({ status: 'error', onRetry: () => {} });
    expect(html).toContain('role="alert"');
    expect(html).toContain(ar['catalog.errorTitle']);
    expect(html).toContain(ar['catalog.retry']);
    expect(html).not.toContain('ضغط الصدر بالبار');
    expect(html).not.toContain('data-testid="catalog-list"');
  });
});
