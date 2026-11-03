'use client';

import { useState } from 'react';
import { DuplicateReview } from '../../../../components/catalog/DuplicateReview';
import { VideoVariationEditor } from '../../../../components/catalog/VideoVariationEditor';
import { getMessages } from '../../../../lib/i18n';
import type { Locale } from '../../../../lib/design/preferences';
import type { DuplicateCandidate } from '../../../../lib/catalog/food-editor';

const candidates: DuplicateCandidate[] = [
  {
    id: 'fixture-food-1',
    names: { ar: 'أرز مطبوخ', en: 'Cooked rice' },
    basis: 'g',
    kcal: 130,
  },
];

export function CatalogFoodsShowcaseClient({
  locale,
  state,
}: {
  locale: Locale;
  state?: string;
}) {
  const messages = getMessages(locale);
  const [selected, setSelected] = useState<DuplicateCandidate | null>(null);
  const [saved, setSaved] = useState(false);
  if (state === 'exact' || state === 'near')
    return (
      <>
        {selected && (
          <p role="status">
            {messages['catalog.duplicateExistingSelected']}{' '}
            {selected.names[locale]}
          </p>
        )}
        <DuplicateReview
          locale={locale}
          role="trainer"
          state={state}
          candidates={candidates}
          onSelectExisting={(candidate) => setSelected(candidate)}
        />
      </>
    );
  if (state === 'video')
    return (
      <>
        {saved && (
          <p role="status">{messages['catalog.videoVariationSaved']}</p>
        )}
        <VideoVariationEditor
          locale={locale}
          workspaces={[
            {
              id: 'fixture-kendo',
              label: messages['catalog.showcaseKendoWorkspace'],
            },
            {
              id: 'fixture-north',
              label:
                locale === 'ar'
                  ? 'مساحة الشمال التجريبية'
                  : 'North demo workspace',
            },
          ]}
          exercises={[
            {
              id: 'fixture-squat',
              label: locale === 'ar' ? 'تمرين القرفصاء' : 'Squat',
            },
          ]}
          initialWorkspaceId="fixture-kendo"
          mapping={{
            workspaceId: 'fixture-kendo',
            exerciseId: 'fixture-squat',
            videoUrl: 'https://youtu.be/abcdefghijk',
            note:
              locale === 'ar'
                ? 'رابط تجريبي لمساحة العمل المحددة فقط'
                : 'Fixture mapping for this workspace only',
            version: 1,
          }}
          onWorkspaceChange={() => setSaved(false)}
          onSubmit={() => setSaved(true)}
        />
      </>
    );
  return null;
}
