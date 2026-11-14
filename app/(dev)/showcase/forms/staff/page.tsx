import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  LOCALE_COOKIE,
  parseLocale,
} from '../../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../../lib/design/showcase';
import { FormsStaffDemo } from '../../../../../components/forms/FormsStaffDemo';

export default async function FormsStaffDemoPage({
  searchParams,
}: {
  searchParams?: Promise<{ defaultConfigurationError?: string }>;
}) {
  if (!isShowcaseEnabled(process.env)) notFound();
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const params = await searchParams;
  return (
    <FormsStaffDemo
      locale={locale}
      defaultConfigurationError={params?.defaultConfigurationError === '1'}
    />
  );
}
