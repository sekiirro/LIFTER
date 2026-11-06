import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { FormsDemo } from '../../../../components/forms/FormsDemo';

export default async function FormsDemoPage() {
  if (!isShowcaseEnabled(process.env)) notFound();
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  return <FormsDemo locale={locale} />;
}
