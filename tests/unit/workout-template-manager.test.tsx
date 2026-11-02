import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkoutTemplateManager } from '../../components/plans/workout/WorkoutTemplateManager';
import type { Locale } from '../../lib/design/preferences';
import { createWorkoutTemplateFixture } from '../../lib/plans/workout/template-fixtures';
import type { WorkoutTemplateActor } from '../../lib/plans/workout/template-management';

function render(
  actor: WorkoutTemplateActor,
  locale: Locale = 'en',
  initialDraft = createWorkoutTemplateFixture(locale).draft,
): string {
  const fixture = createWorkoutTemplateFixture(locale);
  return renderToStaticMarkup(
    <WorkoutTemplateManager
      actor={actor}
      templates={fixture.templates}
      initialDraft={initialDraft}
      locale={locale}
    />,
  );
}

describe('F17 workout template manager UI', () => {
  it('hides every PO-only global control from workspace staff', () => {
    const html = render({ role: 'trainer', workspaceId: 'workspace-a' });

    expect(html).toContain('Create workspace template');
    expect(html).not.toContain('Create global template');
    expect(html).not.toContain('data-template-action="make-global"');
    expect(html).not.toMatch(
      /data-template-action="edit" data-template-scope="global"/,
    );
    expect(html).not.toMatch(
      /data-template-action="retire" data-template-scope="global"/,
    );
    expect(html).toContain('Read only');
  });

  it('shows global governance controls to the platform owner', () => {
    const html = render({ role: 'platform_owner', workspaceId: 'workspace-a' });

    expect(html).toContain('Create global template');
    expect(html).toContain('data-template-action="make-global"');
    expect(html).toMatch(
      /data-template-action="edit" data-template-scope="global"/,
    );
    expect(html).toMatch(
      /data-template-action="retire" data-template-scope="global"/,
    );
  });

  it('renders every numeric value with Arabic-Indic digits in Arabic', () => {
    const html = render({ role: 'trainer', workspaceId: 'workspace-a' }, 'ar', {
      days: [
        {
          id: 'e1000000-0000-4000-8000-000000000001',
          kind: 'rest',
          title: 'يوم الراحة',
        },
      ],
    });

    expect(html).toContain('٤ قوالب');
    expect(html).toContain('الإصدار:');
    expect(html).toContain('>٣</bdi>');
    expect(html).toContain('الصفحة ١ من ١');
    expect(html).toContain('١ أيام منسوخة');
    expect(html).not.toContain('4 قوالب');
    expect(html).not.toContain('الصفحة 1 من 1');
  });
});
