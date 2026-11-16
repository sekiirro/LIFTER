'use client';

import { useCallback, useRef, useState } from 'react';
import { NutritionPlanEditor } from '../../../../components/plans/nutrition/NutritionPlanEditor';
import type { Locale } from '../../../../lib/design/preferences';
import type { NutritionDocumentV1 } from '../../../../lib/plans/nutrition/schema';
import { mockFoods, mockPlanDocument } from './mock';

/**
 * Local host for the F18 slice 1 editor preview. The document lives in state
 * exactly like the eventual page will own it: the editor only reports changes.
 */
export function F18PlanEditorPreview({ locale }: { locale: Locale }) {
  const [document, setDocument] = useState<NutritionDocumentV1>(() =>
    mockPlanDocument(),
  );
  const counter = useRef(0);
  const newId = useCallback(() => {
    counter.current += 1;
    return `showcase-id-${counter.current}`;
  }, []);

  return (
    <NutritionPlanEditor
      locale={locale}
      document={document}
      foods={mockFoods}
      newId={newId}
      onDocumentChange={setDocument}
    />
  );
}
