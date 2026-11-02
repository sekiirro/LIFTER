import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkoutTemplateManager } from '../../components/plans/workout/WorkoutTemplateManager';
import { createWorkoutTemplateFixture } from '../../lib/plans/workout/template-fixtures';
import type { WorkoutTemplateActor } from '../../lib/plans/workout/template-management';

function render(actor: WorkoutTemplateActor): string {
  const fixture = createWorkoutTemplateFixture('en');
  return renderToStaticMarkup(
    <WorkoutTemplateManager
      actor={actor}
      templates={fixture.templates}
      initialDraft={fixture.draft}
      locale="en"
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
});
