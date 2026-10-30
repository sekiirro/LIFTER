'use client';

import { useRef, useState } from 'react';
import { Field } from '../ui/Field';
import { deriveBrand } from '../../lib/design/color';
import { getMessages } from '../../lib/i18n';
import type { Locale } from '../../lib/design/preferences';
import { Bidi } from '../ui/Bidi';
import { BrandScopeProvider } from './BrandScopeProvider';
import styles from './brand-editor.module.css';

type LocalizedText = { ar: string; en: string };
type BrandingProjection = {
  workspaceId: string;
  name: LocalizedText;
  bannerAlt: LocalizedText;
  revision: number;
  color: `#${string}`;
  state: 'draft';
};

type PublishedProjection = {
  name: LocalizedText;
  color: `#${string}`;
  revision: number;
};

type PreviewSurface = 'registration' | 'staff' | 'portal-placeholder';
type MobilePanel = 'editor' | 'preview';

export function BrandEditor({
  locale,
  projection,
  currentPublished,
  saveState = 'idle',
  responseWorkspaceId,
}: {
  locale: Locale;
  projection: BrandingProjection;
  currentPublished?: PublishedProjection | null;
  saveState?: 'idle' | 'stale';
  responseWorkspaceId?: string;
}) {
  const m = getMessages(locale);
  const [surface, setSurface] = useState<PreviewSurface>('registration');
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('editor');
  const [draftName, setDraftName] = useState(projection.name);
  const [draftBannerAlt, setDraftBannerAlt] = useState(projection.bannerAlt);
  const [draftColor, setDraftColor] = useState(projection.color);
  const previewTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const surfaces: Record<PreviewSurface, string> = {
    registration: m['branding.registrationSurface'],
    staff: m['branding.staffSurface'],
    'portal-placeholder': m['branding.portalSurface'],
  };
  const mobilePanels: Record<MobilePanel, string> = {
    editor: m['branding.editorTab'],
    preview: m['branding.previewTab'],
  };
  const colors = deriveBrand(draftColor);
  const displayName =
    draftName[locale].trim() || draftName[locale === 'ar' ? 'en' : 'ar'];
  const responseIsCurrent =
    responseWorkspaceId === undefined ||
    responseWorkspaceId === projection.workspaceId;
  const onTabKeyDown = <T extends string>(
    event: React.KeyboardEvent<HTMLButtonElement>,
    key: T,
    values: T[],
    setter: (value: T) => void,
    refs: React.MutableRefObject<Array<HTMLButtonElement | null>>,
    reverseRtl: boolean,
  ) => {
    const current = values.indexOf(key);
    const backwards =
      reverseRtl && locale === 'ar' ? 'ArrowRight' : 'ArrowLeft';
    const forwards = reverseRtl && locale === 'ar' ? 'ArrowLeft' : 'ArrowRight';
    let next = current;
    if (event.key === backwards)
      next = (current + values.length - 1) % values.length;
    else if (event.key === forwards) next = (current + 1) % values.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = values.length - 1;
    else return;
    event.preventDefault();
    setter(values[next]!);
    refs.current[next]?.focus();
  };

  return (
    <section
      className={styles.editor}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-editor-layout="split"
      data-discard-stale-workspace-response={
        responseIsCurrent ? undefined : 'true'
      }
      aria-labelledby="branding-editor-title"
    >
      <header className={styles.heading}>
        <h1 id="branding-editor-title">{m['branding.editorTitle']}</h1>
        <p>{m['branding.draftSnapshot']}</p>
      </header>
      <div
        className={styles.mobileTabs}
        role="tablist"
        aria-label={m['branding.editorTitle']}
        data-mobile-editor-tabs=""
      >
        {(Object.keys(mobilePanels) as MobilePanel[]).map((panel, index) => (
          <button
            key={panel}
            type="button"
            role="tab"
            id={`branding-mobile-tab-${panel}`}
            aria-selected={mobilePanel === panel}
            aria-controls={`branding-mobile-panel-${panel}`}
            tabIndex={mobilePanel === panel ? 0 : -1}
            ref={(element) => {
              mobileTabRefs.current[index] = element;
            }}
            onClick={() => setMobilePanel(panel)}
            onKeyDown={(event) =>
              onTabKeyDown(
                event,
                panel,
                Object.keys(mobilePanels) as MobilePanel[],
                setMobilePanel,
                mobileTabRefs,
                true,
              )
            }
            data-mobile-editor-tab={panel}
          >
            {mobilePanels[panel]}
          </button>
        ))}
      </div>
      <div className={styles.columns} data-editor-columns="">
        <section
          className={styles.draft}
          id="branding-mobile-panel-editor"
          role="tabpanel"
          aria-labelledby="branding-mobile-tab-editor"
          data-mobile-hidden={mobilePanel === 'preview' ? 'true' : undefined}
          aria-label={m['branding.draftSnapshot']}
          data-unsaved-sample-editor=""
        >
          <h2>{m['branding.draftSnapshot']}</h2>
          <p>{m['branding.localOnly']}</p>
          <p data-upload-guidance-draft="">
            {m['branding.uploadGuidancePrefix']}
            <Bidi dir="ltr">{m['branding.uploadGuidanceFormats']}</Bidi>{' '}
            {m['branding.uploadDimensionPrefix']}
            <Bidi dir="ltr">1600 × 800 px</Bidi>
            {m['branding.uploadDimensionRatioPrefix']}
            <Bidi dir="ltr">2:1</Bidi>
            {m['branding.uploadDimensionSuffix']}
            <Bidi dir="ltr">cover</Bidi>
            {m['branding.uploadCoverSuffix']}
            <Bidi dir="ltr">630 × 288 px</Bidi>
            {m['branding.uploadGuidanceRatioPrefix']}
            <Bidi dir="ltr">2.19:1</Bidi>
            {m['branding.uploadGuidanceSuffix']}
          </p>
          <div className={styles.fields}>
            <Field
              label={m['branding.nameArabic']}
              inputProps={{
                id: 'brand-name-ar',
                value: draftName.ar,
                onChange: (event) =>
                  setDraftName({ ...draftName, ar: event.target.value }),
                dir: 'rtl',
              }}
            />
            <Field
              label={m['branding.nameEnglish']}
              inputProps={{
                id: 'brand-name-en',
                value: draftName.en,
                onChange: (event) =>
                  setDraftName({ ...draftName, en: event.target.value }),
                dir: 'ltr',
              }}
            />
            <Field
              label={m['branding.bannerAltArabic']}
              inputProps={{
                id: 'banner-alt-ar',
                value: draftBannerAlt.ar,
                onChange: (event) =>
                  setDraftBannerAlt({
                    ...draftBannerAlt,
                    ar: event.target.value,
                  }),
                dir: 'rtl',
              }}
            />
            <Field
              label={m['branding.bannerAltEnglish']}
              inputProps={{
                id: 'banner-alt-en',
                value: draftBannerAlt.en,
                onChange: (event) =>
                  setDraftBannerAlt({
                    ...draftBannerAlt,
                    en: event.target.value,
                  }),
                dir: 'ltr',
              }}
            />
            <Field
              label={m['branding.colorField']}
              inputProps={{
                id: 'brand-color',
                type: 'color',
                value: draftColor,
                onChange: (event) =>
                  setDraftColor(event.target.value as `#${string}`),
              }}
            />
          </div>
          <p data-color-accessibility-explanation="">
            {m['branding.colorExplanation']}
          </p>
          <dl className={styles.colors}>
            <div>
              <dt>{m['branding.colorSource']}</dt>
              <dd data-source-color={draftColor}>
                <span
                  aria-hidden="true"
                  className={styles.colorSwatch}
                  style={{ backgroundColor: draftColor }}
                />
                <Bidi dir="ltr">{draftColor}</Bidi>
              </dd>
            </div>
            <div>
              <dt>
                {m['branding.colorAdjusted']} — {m['branding.lightTreatment']}
              </dt>
              <dd data-adjusted-color={colors.light.text}>
                <span
                  aria-hidden="true"
                  className={styles.colorSwatch}
                  style={{ backgroundColor: colors.light.text }}
                />
                <Bidi dir="ltr">{colors.light.text}</Bidi>
              </dd>
              <dt>
                {m['branding.colorAdjusted']} — {m['branding.darkTreatment']}
              </dt>
              <dd data-adjusted-color-dark={colors.dark.text}>
                <span
                  aria-hidden="true"
                  className={styles.colorSwatch}
                  style={{ backgroundColor: colors.dark.text }}
                />
                <Bidi dir="ltr">{colors.dark.text}</Bidi>
              </dd>
            </div>
          </dl>
          {currentPublished && (
            <p data-current-published="">
              {m['branding.currentPublished']}: {currentPublished.name[locale]}
            </p>
          )}
          {saveState === 'stale' && (
            <p className={styles.stale} role="alert">
              {m['branding.staleRevision']}
            </p>
          )}
          {!responseIsCurrent && (
            <p className={styles.stale} role="status">
              {m['branding.staleRevision']}
            </p>
          )}
        </section>
        <section
          className={styles.preview}
          id="branding-mobile-panel-preview"
          role="tabpanel"
          aria-labelledby="branding-mobile-tab-preview"
          data-mobile-hidden={mobilePanel === 'editor' ? 'true' : undefined}
          aria-label={m['branding.previewTitle']}
        >
          <h2>{m['branding.previewTitle']}</h2>
          <div
            className={styles.tabs}
            role="tablist"
            aria-label={m['branding.previewTitle']}
          >
            {(Object.keys(surfaces) as PreviewSurface[]).map((item, index) => (
              <button
                key={item}
                type="button"
                role="tab"
                id={`branding-tab-${item}`}
                aria-selected={surface === item}
                aria-controls={`branding-panel-${item}`}
                tabIndex={surface === item ? 0 : -1}
                ref={(element) => {
                  previewTabRefs.current[index] = element;
                }}
                onClick={() => setSurface(item)}
                onKeyDown={(event) =>
                  onTabKeyDown(
                    event,
                    item,
                    Object.keys(surfaces) as PreviewSurface[],
                    setSurface,
                    previewTabRefs,
                    true,
                  )
                }
                data-preview-tab={item}
              >
                {surfaces[item]}
              </button>
            ))}
          </div>
          {(Object.keys(surfaces) as PreviewSurface[]).map((item) => (
            <BrandScopeProvider
              key={item}
              workspaceId={projection.workspaceId}
              responseWorkspaceId={
                responseIsCurrent
                  ? projection.workspaceId
                  : (responseWorkspaceId ?? null)
              }
              color={draftColor}
            >
              <section
                id={`branding-panel-${item}`}
                className={styles.surface}
                role="tabpanel"
                aria-labelledby={`branding-tab-${item}`}
                hidden={surface !== item}
                data-preview-surface={item}
              >
                <div className={styles.surfaceIdentity}>
                  <h3>{displayName}</h3>
                  <span aria-hidden="true" className={styles.sampleButton}>
                    {surfaces[item]}
                  </span>
                </div>
                {item === 'portal-placeholder' && (
                  <p>{surfaces['portal-placeholder']}</p>
                )}
              </section>
            </BrandScopeProvider>
          ))}
        </section>
      </div>
    </section>
  );
}
