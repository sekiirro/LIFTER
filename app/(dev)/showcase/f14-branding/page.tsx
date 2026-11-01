import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { BrandEditor } from '../../../../components/branding/BrandEditor';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import styles from './page.module.css';

export default async function BrandingPreviewPage() {
  if (!isShowcaseEnabled(process.env)) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);

  return (
    <main className={styles.page}>
      <p className={styles.notice} role="note">
        {m['branding.showcaseNotice']}
      </p>
      <BrandEditor
        locale={locale}
        projection={{
          workspaceId: '00000000-0000-4000-8000-000000000001',
          name: { ar: 'نادي النخبة', en: 'Elite Club' },
          bannerAlt: { ar: '', en: '' },
          revision: 7,
          color: '#2563EB',
          state: 'draft',
        }}
        currentPublished={{
          name: { ar: 'النادي المنشور', en: 'Published Club' },
          color: '#059669',
          revision: 5,
        }}
      />
    </main>
  );
}
