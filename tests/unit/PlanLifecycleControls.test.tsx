import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PlanLifecycleControls } from '../../components/plan-core/PlanLifecycleControls';
import { getMessages } from '../../lib/i18n';

const planId = '123e4567-e89b-12d3-a456-426614174000';

type TestNode = {
  props?: {
    children?: unknown;
    'data-testid'?: string;
    onClick?: () => void;
  };
};

function findNode(node: unknown, testId: string): TestNode | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, testId);
      if (found) return found;
    }
    return null;
  }
  const candidate = node as TestNode;
  if (candidate.props?.['data-testid'] === testId) return candidate;
  if (candidate.props?.children)
    return findNode(candidate.props.children, testId);
  return null;
}

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

  it('renders localized readiness text instead of the raw enum', () => {
    const html = renderToStaticMarkup(
      createElement(PlanLifecycleControls, {
        locale: 'ar',
        planId,
        projection: { readiness: 'published' },
        messages: getMessages('ar'),
      }),
    );
    expect(html).toContain(getMessages('ar')['planCore.readiness.published']);
    expect(html).not.toContain('>published<');
  });

  it('keeps save-draft wired to save, not create', () => {
    const onSaveDraft = vi.fn();
    const onCreateNewPlan = vi.fn();
    const onPublish = vi.fn();
    const tree = PlanLifecycleControls({
      locale: 'en',
      planId,
      messages: getMessages('en'),
      onSaveDraft,
      onCreateNewPlan,
      onPublish,
    } as Record<string, unknown>);
    const button = findNode(tree, 'save-draft');
    expect(button).toBeTruthy();
    button!.props!.onClick!();
    expect(onSaveDraft).toHaveBeenCalledWith(planId);
    expect(onCreateNewPlan).not.toHaveBeenCalled();
  });

  it('publishes only through the ready-publish action', () => {
    const onPublish = vi.fn();
    const onSaveDraft = vi.fn();
    const tree = PlanLifecycleControls({
      locale: 'en',
      planId,
      messages: getMessages('en'),
      onPublish,
      onSaveDraft,
    } as Record<string, unknown>);
    const button = findNode(tree, 'ready-publish');
    expect(button).toBeTruthy();
    button!.props!.onClick!();
    expect(onPublish).toHaveBeenCalledWith(planId);
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
