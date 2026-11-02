import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  NutritionTemplateManager,
  type NutritionTemplateManagerProps,
} from '../../components/plans/NutritionTemplateManager';
import {
  copyNutritionTemplateVersion,
  MAX_TEMPLATE_PAGE_SIZE,
  paginateNutritionTemplates,
  scopeNutritionTemplates,
  type NutritionTemplate,
} from '../../components/plans/NutritionTemplateManagerModel';
import type { NutritionDocument } from '../../lib/plans/nutrition/schema';
import { getMessages } from '../../lib/i18n';

const workspaceA = 'workspace-a';
const workspaceB = 'workspace-b';
const dayTypeId = '00000000-0000-4000-8000-000000000001';
const foodId = '00000000-0000-4000-8000-000000000002';
const document: NutritionDocument = {
  structure: { kind: 'single_day', implicitDayTypeId: dayTypeId },
  dayTypes: [{ id: dayTypeId, name: 'Training', trainingDay: true }],
  meals: [
    {
      id: '00000000-0000-4000-8000-000000000003',
      conditional: 'always',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000004',
          foodVersionId: foodId,
          quantity: { value: '100', unit: 'g' },
          alternatives: [],
        },
      ],
    },
  ],
};

function template(
  id: string,
  name: string,
  scope: 'global' | 'workspace' = 'workspace',
  options: Partial<NutritionTemplate> = {},
): NutritionTemplate {
  return {
    id,
    name: { ar: `قالب ${name}`, en: name },
    scope,
    ...(scope === 'workspace' ? { workspaceId: workspaceA } : {}),
    retired: false,
    eligibleForGlobal: scope === 'workspace',
    origin: 'Workspace A',
    versions: [
      { version: 1, document },
      { version: 2, document: { ...document, meals: [...document.meals] } },
    ],
    ...options,
  };
}

const baseProps: NutritionTemplateManagerProps = {
  locale: 'en',
  role: 'staff',
  selectedWorkspaceId: workspaceA,
  templates: [
    template('workspace-template', 'Workspace template'),
    template('global-template', 'Global template', 'global'),
  ],
  canManageWorkspaceTemplates: true,
  onCreate: vi.fn(),
  onCreateVersion: vi.fn(),
  onRetire: vi.fn(),
  onMakeItGlobal: vi.fn(),
  onLoadIntoDraft: vi.fn(),
};

function render(overrides: Partial<NutritionTemplateManagerProps> = {}) {
  return renderToStaticMarkup(
    createElement(NutritionTemplateManager, { ...baseProps, ...overrides }),
  );
}

describe('NutritionTemplateManager governance and scope', () => {
  it('never exposes Make it Global to workspace staff', () => {
    const html = render({ role: 'staff' });
    expect(html).toContain('Workspace template');
    expect(html).not.toContain(getMessages('en')['nutritionTemplates.makeGlobal']);
  });

  it('shows Make it Global only to PO for an eligible workspace template', () => {
    const po = render({ role: 'po' });
    expect(po).toContain(getMessages('en')['nutritionTemplates.makeGlobal']);
    const ineligible = render({
      role: 'po',
      templates: [
        template('ineligible', 'Ineligible', 'workspace', {
          eligibleForGlobal: false,
        }),
      ],
      canReadGlobalTemplates: false,
    });
    expect(ineligible).not.toContain(
      getMessages('en')['nutritionTemplates.makeGlobal'],
    );
  });

  it('shows only templates for the selected workspace', () => {
    const list = [
      template('a', 'Workspace A template'),
      template('b', 'Workspace B template', 'workspace', {
        workspaceId: workspaceB,
      }),
      template('global', 'Global template', 'global'),
    ];
    expect(scopeNutritionTemplates(list, 'workspace', workspaceA).map((x) => x.id)).toEqual(['a']);
    const html = render({ templates: list });
    expect(html).toContain('Workspace A template');
    expect(html).not.toContain('Workspace B template');
  });

  it('keeps global templates read-only for non-PO and masks their origin', () => {
    const html = render({
      templates: [template('global', 'Global template', 'global')],
    });
    expect(html).toContain('Global template');
    expect(html).toContain(getMessages('en')['nutritionTemplates.loadVersion']);
    expect(html).not.toContain(getMessages('en')['nutritionTemplates.retire']);
    expect(html).not.toContain(getMessages('en')['nutritionTemplates.createVersion']);
    expect(html).not.toContain('Workspace A');
  });

  it('allows PO to see origin and denies Sales template access', () => {
    const po = render({ role: 'po', templates: [template('global', 'Global template', 'global')] });
    expect(po).toContain('Workspace A');
    const sales = render({ role: 'sales' });
    expect(sales).toContain(getMessages('en')['nutritionTemplates.noAccess']);
    expect(sales).not.toContain('Workspace template');
    expect(sales).not.toContain(getMessages('en')['nutritionTemplates.makeGlobal']);
  });
});

describe('NutritionTemplateManager versions and pagination', () => {
  it('keeps retired templates visible as history and disables loading them', () => {
    const html = render({
      templates: [template('retired', 'Retired template', 'workspace', { retired: true })],
    });
    expect(html).toContain(getMessages('en')['nutritionTemplates.retired']);
    expect(html).toContain('disabled=""');
    expect(html).not.toContain(getMessages('en')['nutritionTemplates.retire']);
  });

  it('renders explicit immutable versions and preserves exact version selection', () => {
    const html = render({ templates: [template('versions', 'Versioned template')] });
    expect(html).toContain('Load version into draft <bdi dir="ltr">1</bdi>');
    expect(html).toContain('Load version into draft <bdi dir="ltr">2</bdi>');
    expect(render({ locale: 'ar' })).toContain(
      'تحميل الإصدار إلى مسودة <bdi dir="ltr">١</bdi>',
    );
    const loaded = copyNutritionTemplateVersion(
      template('versions', 'Versioned template'),
      1,
    );
    expect(loaded).toEqual({
      sourceTemplateId: 'versions',
      sourceVersion: 1,
      document,
    });
    expect(loaded?.document).not.toBe(document);
    loaded!.document.meals[0]!.items[0]!.quantity.value = '125';
    expect(document.meals[0]!.items[0]!.quantity.value).toBe('100');
    expect(copyNutritionTemplateVersion(
      template('retired', 'Retired template', 'workspace', { retired: true }),
      2,
    )).toBeNull();
  });

  it('caps every template page at 50 rows', () => {
    const entries = Array.from({ length: 63 }, (_, index) =>
      template(`template-${index}`, `Template ${index}`),
    );
    const page = paginateNutritionTemplates(entries, 1, 500);
    expect(page.pageSize).toBe(MAX_TEMPLATE_PAGE_SIZE);
    expect(page.items).toHaveLength(50);
    expect(page.totalPages).toBe(2);
    expect(paginateNutritionTemplates(entries, 2, 500).items).toHaveLength(13);
    const html = render({ templates: entries, pageSize: 500 });
    expect(html.match(/data-testid="nutrition-template-row"/g)).toHaveLength(50);
    expect(html).toContain(getMessages('en')['nutritionTemplates.next']);
  });

  it('renders loading, empty and error states with retry feedback', () => {
    expect(render({ state: 'loading' })).toContain('aria-busy="true"');
    expect(render({ state: 'loading' })).toContain(
      getMessages('en')['nutritionTemplates.loading'],
    );
    expect(render({ templates: [] })).toContain(
      getMessages('en')['nutritionTemplates.empty'],
    );
    expect(render({ state: 'error', onRetry: vi.fn() })).toContain('role="alert"');
    expect(render({ state: 'error', onRetry: vi.fn() })).toContain(
      getMessages('en')['nutritionTemplates.retry'],
    );
  });
});
