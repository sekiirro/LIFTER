import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LanguageSwitcher } from '../../../../components/preferences/LanguageSwitcher';
import { ThemeSwitcher } from '../../../../components/preferences/ThemeSwitcher';
import { WorkoutTemplateManager } from '../../../../components/plans/workout/WorkoutTemplateManager';
import { BrandScope } from '../../../../components/ui/BrandScope';
import {
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  THEME_COOKIE,
} from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import { createWorkoutTemplateFixture } from '../../../../lib/plans/workout/template-fixtures';
import type { WorkoutTemplateActor } from '../../../../lib/plans/workout/template-management';
import styles from './page.module.css';

export default async function WorkoutTemplatesPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string | string[] }>;
}) {
  if (!isShowcaseEnabled(process.env)) notFound();
  const [preferences, query] = await Promise.all([cookies(), searchParams]);
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);
  const actorValue = Array.isArray(query.actor) ? query.actor[0] : query.actor;
  const fixture = createWorkoutTemplateFixture(locale);
  const actor: WorkoutTemplateActor = {
    role: actorValue === 'po' ? 'platform_owner' : 'trainer',
    workspaceId: fixture.workspaceId,
  };

  return (
    <BrandScope color="#2563EB">
      <main className={styles.page}>
        <header className={styles.header}>
          <h1>{m['templates.showcaseTitle']}</h1>
          <p>{m['templates.showcaseIntro']}</p>
        </header>
        <nav className={styles.controls} aria-label={m['showcase.preferences']}>
          <ThemeSwitcher
            key={theme}
            value={theme}
            label={m['theme.label']}
            labels={{
              system: m['theme.system'],
              dark: m['theme.dark'],
              light: m['theme.light'],
            }}
          />
          <LanguageSwitcher
            value={locale}
            label={m['language.label']}
            labels={{ ar: m['language.ar'], en: m['language.en'] }}
          />
          <a href="?actor=staff">{m['templates.staffView']}</a>
          <a href="?actor=po">{m['templates.poView']}</a>
          <a href="/showcase">{m['showcase.backToShowcase']}</a>
        </nav>
        <WorkoutTemplateManager
          actor={actor}
          templates={fixture.templates}
          initialDraft={fixture.draft}
          locale={locale}
        />
      </main>
    </BrandScope>
  );
}
