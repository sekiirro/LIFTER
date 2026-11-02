'use client';

import { useState } from 'react';
import { CatalogListShell } from '../../../../components/catalog/CatalogListShell';
import type {
  CatalogListItem,
  CatalogListKind,
  CatalogListStatus,
} from '../../../../lib/catalog/list';
import type { Locale } from '../../../../lib/design/preferences';

export function CatalogPreview({
  locale,
  kind,
  items,
  status,
  initialQuery,
}: {
  locale: Locale;
  kind: CatalogListKind;
  items: readonly CatalogListItem[];
  status: CatalogListStatus;
  initialQuery?: string;
}) {
  const [currentStatus, setCurrentStatus] = useState<CatalogListStatus>(status);
  return (
    <CatalogListShell
      locale={locale}
      kind={kind}
      items={items}
      status={currentStatus}
      initialQuery={initialQuery}
      onRetry={() => setCurrentStatus('ready')}
    />
  );
}
