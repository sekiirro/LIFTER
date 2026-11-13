import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert } from '../../../components/ui/Alert';
import { requireActor } from '../../../lib/auth/actor';
import { search, workspaceLibrary } from '../../../lib/catalog/server';
import type { CatalogExerciseListItem } from '../../../lib/catalog/list';
import {
  LOCALE_COOKIE,
  dirFor,
  parseLocale,
} from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { ExerciseLibraryResults } from './ExerciseLibraryResults';
import styles from './exercise-library.module.css';

const PAGE_SIZE = 20;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SearchParams = {
  q?: string | string[];
  muscle?: string | string[];
  equipment?: string | string[];
  cursor?: string | string[];
  workspace?: string | string[];
};

function value(input: string | string[] | undefined): string {
  return typeof input === 'string' ? input : '';
}

function exerciseRows(data: unknown): CatalogExerciseListItem[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.result_id !== 'string' ||
      !row.result_payload ||
      typeof row.result_payload !== 'object'
    )
      return [];
    const payload = row.result_payload as Record<string, unknown>;
    const effective =
      payload.effective_fields && typeof payload.effective_fields === 'object'
        ? (payload.effective_fields as Record<string, unknown>)
        : null;
    const resolvedName =
      effective?.name && typeof effective.name === 'object'
        ? ((effective.name as Record<string, unknown>).value as
            Record<string, unknown> | undefined)
        : undefined;
    // A resolved name is authoritative, including null (cleared override).
    const nameAr = resolvedName ? resolvedName.name_ar : payload.name_ar;
    const nameEn = resolvedName ? resolvedName.name_en : payload.name_en;
    const equipment = Array.isArray(payload.equipment_codes)
      ? payload.equipment_codes[0]
      : undefined;
    if (
      typeof nameEn !== 'string' ||
      typeof payload.primary_muscle_code !== 'string' ||
      typeof equipment !== 'string'
    )
      return [];
    return [
      {
        id: row.result_id,
        kind: 'exercise' as const,
        scope:
          row.result_kind === 'private'
            ? ('workspace' as const)
            : ('global' as const),
        names: {
          ar: typeof nameAr === 'string' ? nameAr : '',
          en: nameEn,
        },
        primaryMuscle:
          payload.primary_muscle_code as CatalogExerciseListItem['primaryMuscle'],
        equipment: equipment as CatalogExerciseListItem['equipment'],
        lifecycleState: 'active' as const,
        ...(typeof row.result_cursor === 'string'
          ? { cursor: row.result_cursor }
          : {}),
      },
    ];
  });
}

export default async function ExerciseLibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const actor = await requireActor();
  if (
    !actor.role ||
    !(['platform_owner', 'workspace_owner', 'trainer'] as string[]).includes(
      actor.role,
    )
  )
    notFound();
  const params = await searchParams;
  const q = value(params.q).slice(0, 120);
  const muscle = value(params.muscle);
  const equipment = value(params.equipment);
  const cursorValue = value(params.cursor);
  const workspaceId =
    params.workspace === undefined
      ? null
      : typeof params.workspace === 'string' && UUID.test(params.workspace)
        ? params.workspace
        : notFound();
  if (
    workspaceId &&
    actor.role !== 'platform_owner' &&
    !actor.activeWorkspaceIds.includes(workspaceId)
  )
    notFound();
  const CURSOR_HEX = /^[0-9a-f]+$/i;
  if (cursorValue && !(workspaceId ? CURSOR_HEX : UUID).test(cursorValue))
    notFound();
  const filters: Record<string, unknown> = workspaceId
    ? {}
    : { page_size: PAGE_SIZE + 1 };
  if (muscle) filters.primary_muscle_code = muscle;
  if (equipment) filters.equipment_codes = [equipment];
  const result = workspaceId
    ? await workspaceLibrary({
        workspaceId,
        query: q,
        filters,
        cursor: cursorValue || null,
        limit: PAGE_SIZE + 1,
      })
    : await search({
        kind: 'exercise',
        query: q,
        filters,
        cursor: cursorValue || null,
      });
  if (result.status === 'not_permitted') notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  if (result.status !== 'ok')
    return (
      <main className={styles.main} dir={dirFor(locale)} lang={locale}>
        <header className={styles.header}>
          <div>
            <h1>{m['catalog.exerciseTitle']}</h1>
            <p>{m['catalog.exerciseIntro']}</p>
          </div>
          <Link
            className={styles.action}
            href={
              workspaceId
                ? `/exercise-library/new?scope=workspace&workspace=${encodeURIComponent(workspaceId)}`
                : '/exercise-library/new'
            }
          >
            {m['catalog.addExercise']}
          </Link>
        </header>
        <Alert tone="error" title={m['catalog.errorTitle']} />
      </main>
    );
  const rawRows = Array.isArray(result.data) ? result.data : [];
  const rows = exerciseRows(rawRows);
  const page = rows.slice(0, PAGE_SIZE);
  const hasMore = rawRows.length > PAGE_SIZE;
  const lastRow = page.at(-1);
  const nextCursor = hasMore
    ? workspaceId
      ? lastRow?.cursor
      : lastRow?.id
    : undefined;
  const nextParams = new URLSearchParams();
  if (q) nextParams.set('q', q);
  if (muscle) nextParams.set('muscle', muscle);
  if (equipment) nextParams.set('equipment', equipment);
  if (workspaceId) nextParams.set('workspace', workspaceId);
  if (nextCursor) nextParams.set('cursor', nextCursor);
  return (
    <main className={styles.main} dir={dirFor(locale)} lang={locale}>
      <header className={styles.header}>
        <div>
          <h1>{m['catalog.exerciseTitle']}</h1>
          <p>{m['catalog.exerciseIntro']}</p>
        </div>
        <Link
          className={styles.action}
          href={
            workspaceId
              ? `/exercise-library/new?scope=workspace&workspace=${encodeURIComponent(workspaceId)}`
              : '/exercise-library/new'
          }
        >
          {m['catalog.addExercise']}
        </Link>
      </header>
      <ExerciseLibraryResults
        key={`${q}:${muscle}:${equipment}:${cursorValue}`}
        locale={locale}
        items={page}
        query={q}
        filters={{ muscleGroup: muscle, equipment }}
        workspaceId={workspaceId}
        nextHref={nextCursor ? `/exercise-library?${nextParams}` : null}
      />
    </main>
  );
}
