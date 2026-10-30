import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { TermsCard } from '../../../components/forms/TermsCard';
import styles from '../../../components/forms/S14ConsentDemo.module.css';
import { BrandScope } from '../../../components/ui/BrandScope';
import { Card } from '../../../components/ui/Card';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../lib/design/showcase';
import { getMessages } from '../../../lib/i18n';

function policySections(report: string, locale: 'ar' | 'en') {
  const heading =
    locale === 'ar' ? '## Draft Egyptian Arabic' : '## Draft English';
  const start = report.indexOf(heading);
  const rest = report.slice(start + heading.length);
  const end = rest.search(/^## /m);
  const body = (end === -1 ? rest : rest.slice(0, end)).trim();
  return [
    ...body.matchAll(/^### (.+)\r?\n\r?\n([\s\S]*?)(?=\r?\n### |$)/gm),
  ].map(([, title, text]) => ({ title: title!.trim(), body: text!.trim() }));
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  if (!isShowcaseEnabled(process.env)) notFound();
  const [preferences, query, report] = await Promise.all([
    cookies(),
    searchParams,
    readFile(
      join(process.cwd(), 'specs/015-forms-intake/reports/S14-terms-draft.md'),
      'utf8',
    ),
  ]);
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const copy = getMessages(locale);
  const acceptedContent = (
    <Card as="section" aria-labelledby="welcome-title" lang={locale}>
      <h1 id="welcome-title">{copy['forms.welcomeTitle']}</h1>
      <p>{copy['forms.welcomeBody']}</p>
      {process.env.NODE_ENV !== 'production' && (
        <p role="status">{copy['forms.welcomeDraftStatus']}</p>
      )}
    </Card>
  );
  const journey = (
    <main className={styles.main}>
      <TermsCard
        locale={locale}
        policy={{
          version: 'terms-draft-v1',
          isDraft: true,
          draftLabel: copy['forms.copyDraft'],
          sections: policySections(report, locale),
        }}
        labels={{
          title: copy['forms.termsCardTitle'],
          requiredTerms: copy['forms.requiredTerms'],
          optionalMarketing: copy['forms.optionalMarketing'],
          accept: copy['forms.acceptTerms'],
          unavailable: copy['forms.draftAcceptanceUnavailable'],
        }}
        onAccept={() => undefined}
        pendingMessage={copy['forms.intakeIncomplete']}
        acceptedContent={acceptedContent}
        mockAcceptanceKey="f15-welcome-terms-mock-v1"
      />
    </main>
  );

  return query.brand === 'sample' ? (
    <BrandScope color="#7C3AED">{journey}</BrandScope>
  ) : (
    journey
  );
}
