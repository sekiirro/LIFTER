import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { S14ConsentDemo } from '../../../../../components/forms/S14ConsentDemo';
import {
  LOCALE_COOKIE,
  parseLocale,
} from '../../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../../lib/design/showcase';
import decisions from '../../../../../specs/015-forms-intake/fixtures/s14-po-decisions.json';

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

export default async function S14ConsentShowcasePage() {
  if (!isShowcaseEnabled(process.env)) notFound();
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const report = await readFile(
    join(process.cwd(), 'specs/015-forms-intake/reports/S14-terms-draft.md'),
    'utf8',
  );
  return (
    <S14ConsentDemo
      locale={locale}
      sections={policySections(report, locale)}
      notice={decisions.P2_health_notice}
    />
  );
}
