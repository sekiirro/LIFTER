import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { AuthorizedClientForm } from '../../../../components/forms/AuthorizedClientForm';
import { ClientFormUnavailable } from '../../../../components/forms/ClientFormUnavailable';
import { loadClientAssignment } from '../../../../lib/forms/client-assignment';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default async function ClientFormAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const [{ assignmentId }, preferences] = await Promise.all([
    params,
    cookies(),
  ]);
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  if (!uuidPattern.test(assignmentId)) notFound();
  const assignment = await loadClientAssignment(assignmentId);
  if (assignment.status === 'not_found') notFound();
  if (assignment.status === 'unavailable')
    return <ClientFormUnavailable locale={locale} />;

  return (
    <AuthorizedClientForm
      assignmentId={assignmentId}
      locale={locale}
      assignment={assignment}
    />
  );
}
