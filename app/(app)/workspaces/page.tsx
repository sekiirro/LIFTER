import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { WorkspacesManager } from './WorkspacesManager';

export default async function WorkspacesPage() {
  const actor = await requireActor();
  if (actor.role !== 'platform_owner') notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return <WorkspacesManager locale={locale} />;
}
