import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../lib/auth/actor';
import { createSupabaseBrandingRepository } from '../../../lib/branding/repository';
import { filterBrandingWorkspaces } from '../../../lib/branding/workspaces';
import { createPortalBrandContract } from '../../../lib/branding/portal-contract';
import { createSessionClient } from '../../../lib/supabase/server';
import { getMessages } from '../../../lib/i18n';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { Field } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';
import { BrandScope } from '../../../components/ui/BrandScope';
import { saveBrandingAction, publishBrandingAction } from './actions';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { ClientPortalBrandPreview } from '../../../components/branding/ClientPortalBrandPreview';
import { DEFAULT_BRAND } from '../../../lib/design/color';
import { registrationBrandName } from '../../../lib/branding/registration-name';
import styles from './branding.module.css';

export default async function WorkspaceBrandingPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[]; status?: string }>;
}) {
  const actor = await requireActor();
  if (!actor.role) notFound();
  const client = await createSessionClient();
  if (!client) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const result = await client
    .from('workspaces')
    .select('id,name')
    .order('name');
  if (result.error || !result.data) notFound();
  const workspaces = filterBrandingWorkspaces(result.data, actor);
  if (!workspaces.length) notFound();
  const query = await searchParams;
  const requestedWorkspace = query.workspace;
  const workspaceId = requestedWorkspace ?? workspaces[0]!.id;
  if (
    typeof workspaceId !== 'string' ||
    !workspaces.some(({ id }) => id === workspaceId)
  )
    notFound();
  const repository = createSupabaseBrandingRepository(client);
  const draft = await repository.getDraft(workspaceId);
  const current = await repository.getCurrentPublication(workspaceId);
  const draftFields = draft?.fields ?? {
    names: { ar: '', en: '' },
    color: current?.fields.color ?? DEFAULT_BRAND,
  };
  const portalBrand = current
    ? createPortalBrandContract({
        workspaceName:
          current.fields.names[locale] ||
          current.fields.names[locale === 'ar' ? 'en' : 'ar'],
        color: current.fields.color,
      })
    : null;
  const statusMessage =
    query.status === 'stale'
      ? m['branding.staleRevision']
      : query.status === 'saved'
        ? m['branding.savedDraft']
        : query.status === 'published'
          ? m['branding.publishedNotice']
          : query.status === 'unavailable'
            ? m['branding.genericUnavailable']
            : query.status === 'invalid'
              ? m['branding.nameRequired']
              : null;

  return (
    <main className={styles.main} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className={styles.header}>
        <h1>{m['branding.editorTitle']}</h1>
        <p>{m['branding.draftSnapshot']}</p>
      </header>
      {workspaces.length > 1 && (
        <WorkspaceSwitcher
          locale={locale}
          selected={workspaceId}
          workspaces={workspaces}
        />
      )}
      {statusMessage && (
        <Alert
          tone={
            query.status === 'stale' ||
            query.status === 'unavailable' ||
            query.status === 'invalid'
              ? 'error'
              : 'success'
          }
          title={statusMessage}
        />
      )}
      <section className={styles.panel} aria-labelledby="branding-draft-title">
        <h2 id="branding-draft-title">{m['branding.draftSnapshot']}</h2>
        <form action={saveBrandingAction} className={styles.form}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="revision" value={draft?.revision ?? 0} />
          <Field
            label={m['branding.nameArabic']}
            inputProps={{
              name: 'nameAr',
              defaultValue: draftFields.names.ar,
              dir: 'rtl',
            }}
          />
          <Field
            label={m['branding.nameEnglish']}
            inputProps={{
              name: 'nameEn',
              defaultValue: draftFields.names.en,
              dir: 'ltr',
            }}
          />
          <Field
            label={m['branding.colorField']}
            inputProps={{
              name: 'color',
              type: 'color',
              defaultValue: draftFields.color,
            }}
          />
          <div className={styles.actions}>
            <Button type="submit">{m['branding.saveDraft']}</Button>
          </div>
        </form>
        <form action={publishBrandingAction} className={styles.publish}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="revision" value={draft?.revision ?? 0} />
          <p data-current-published="">
            {m['branding.currentPublished']}:{' '}
            {registrationBrandName(
              current?.fields.names,
              locale,
              m['branding.noPublished'],
            )}
          </p>
          <Button type="submit">{m['branding.publishCurrent']}</Button>
        </form>
        <BrandScope
          color={draftFields.color}
          className={styles.preview}
          aria-labelledby="branding-preview-title"
          data-branding-private-preview=""
        >
          <h2 id="branding-preview-title">{m['branding.previewTitle']}</h2>
          <p>
            {draftFields.names[locale] ||
              workspaces.find(({ id }) => id === workspaceId)?.name}
          </p>
          <Button type="button">{m['branding.staffSurface']}</Button>
        </BrandScope>
      </section>
      <ClientPortalBrandPreview
        locale={locale}
        messages={m}
        contract={portalBrand}
      />
    </main>
  );
}
