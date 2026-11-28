import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { BrandScope } from '../../../../components/ui/BrandScope';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import { MonthlyQualityPreview } from './MonthlyQualityPreview';

export default async function MonthlyQualityShowcasePage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string | string[] }>;
}) {
  if (!isShowcaseEnabled(process.env)) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  const params = await searchParams;
  const brand =
    typeof params.brand === 'string' && /^#[0-9a-f]{6}$/i.test(params.brand)
      ? params.brand
      : undefined;
  return (
    <BrandScope color={brand} data-testid="monthly-quality-showcase">
      <MonthlyQualityPreview locale={locale} messages={messages} />
    </BrandScope>
  );
}
