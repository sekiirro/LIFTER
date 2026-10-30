import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { FormsDemo } from '../../../../components/forms/FormsDemo';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';

export default async function ClientFormPreviewPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  if (!isShowcaseEnabled(process.env)) notFound();
  const [{ assignmentId }, preferences] = await Promise.all([
    params,
    cookies(),
  ]);
  return (
    <FormsDemo
      locale={parseLocale(preferences.get(LOCALE_COOKIE)?.value)}
      assignmentId={assignmentId}
    />
  );
}
