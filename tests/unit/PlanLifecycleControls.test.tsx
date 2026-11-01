import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PlanLifecycleControls } from '../../components/plan-core/PlanLifecycleControls';
import { getMessages } from '../../lib/i18n';

const planId = '123e4567-e89b-12d3-a456-426614174000';

describe('plan lifecycle controls', () => {
  it('does not expose a client-visible draft while editing', () => {
    const html = renderToStaticMarkup(
      createElement(PlanLifecycleControls, {
        locale: 'en',
        planId,
        projection: {
          planId,
          readiness: 'published',
          draft: { visibility: 'private', content: 'SECRET DRAFT CONTENT' },
        },
        messages: getMessages('en'),
      }),
    );
    expect(html).not.toContain('SECRET DRAFT CONTENT');
    expect(html).toContain('Draft changes stay private until published.');
  });

  it('renders silent autosave, Save as Draft, Ready & Publish, and Create New Plan', () => {
    const html = renderToStaticMarkup(
      createElement(PlanLifecycleControls, {
        locale: 'en',
        planId,
        messages: getMessages('en'),
      }),
    );
    expect(html).toContain('Changes save automatically.');
    expect(html).toContain('Save as Draft');
    expect(html).toContain('Ready &amp; Publish');
    expect(html).toContain('Create New Plan');
    expect(html).toContain('data-autosave="true"');
  });

  it('preserves plan identity in the rendered controls', () => {
    const html = renderToStaticMarkup(
      createElement(PlanLifecycleControls, {
        locale: 'en',
        planId,
        messages: getMessages('en'),
      }),
    );
    expect(html).toContain(planId);
    expect(html).toContain('data-action="save-draft"');
    expect(html).toContain('data-action="ready-publish"');
    expect(html).toContain('data-action="create-new-plan"');
  });

  it('keeps save-draft distinct from create and publish', () => {
    const onSaveDraft = vi.fn();
    const onPublish = vi.fn();
    const onCreateNewPlan = vi.fn();
    const html = renderToStaticMarkup(
      createElement(PlanLifecycleControls, {
        locale: 'en',
        planId,
        messages: getMessages('en'),
        onSaveDraft,
        onPublish,
        onCreateNewPlan,
      }),
    );
    expect(html).toContain('data-testid="save-draft"');
    expect(html).toContain('data-testid="ready-publish"');
    expect(html).toContain('data-testid="create-new-plan"');
  });

  it('renders Arabic labels', () => {
    const html = renderToStaticMarkup(
      createElement(PlanLifecycleControls, {
        locale: 'ar',
        planId,
        messages: getMessages('ar'),
      }),
    );
    expect(html).toContain('حفظ كمسودة');
    expect(html).toContain('جاهز ونشر');
    expect(html).toContain('إنشاء خطة جديدة');
  });
});
