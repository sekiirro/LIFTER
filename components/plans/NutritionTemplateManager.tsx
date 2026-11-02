'use client';

import { useState } from 'react';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { dirFor, type Locale } from '../../lib/design/preferences';
import { formatDigits } from '../../lib/i18n/format-digits';
import { getMessages } from '../../lib/i18n';
import { Bidi } from '../ui/Bidi';
import {
  copyNutritionTemplateVersion,
  DEFAULT_TEMPLATE_PAGE_SIZE,
  paginateNutritionTemplates,
  scopeNutritionTemplates,
  type NutritionTemplate,
} from './NutritionTemplateManagerModel';
import styles from './NutritionTemplateManager.module.css';

export type NutritionTemplateManagerProps = {
  locale: Locale;
  role: 'po' | 'staff' | 'sales';
  selectedWorkspaceId: string;
  templates: readonly NutritionTemplate[];
  canReadGlobalTemplates?: boolean;
  canManageWorkspaceTemplates?: boolean;
  pageSize?: number;
  state?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  onCreate?: (scope: NutritionTemplate['scope']) => void;
  onCreateVersion?: (template: NutritionTemplate) => void;
  onRetire?: (template: NutritionTemplate) => void;
  onMakeItGlobal?: (template: NutritionTemplate) => void;
  onLoadIntoDraft: (input: {
    templateId: string;
    version: number;
    document: NutritionTemplate['versions'][number]['document'];
  }) => void | Promise<void>;
};

export function NutritionTemplateManager({
  locale,
  role,
  selectedWorkspaceId,
  templates,
  canReadGlobalTemplates = role !== 'sales',
  canManageWorkspaceTemplates = false,
  pageSize = DEFAULT_TEMPLATE_PAGE_SIZE,
  state = 'ready',
  onRetry,
  onCreate,
  onCreateVersion,
  onRetire,
  onMakeItGlobal,
  onLoadIntoDraft,
}: NutritionTemplateManagerProps) {
  const m = getMessages(locale);
  const [pages, setPages] = useState({ global: 1, workspace: 1 });
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  const canWriteGlobal = role === 'po';
  const canWriteWorkspace = role !== 'sales' && canManageWorkspaceTemplates;
  const globalTemplates = canReadGlobalTemplates
    ? scopeNutritionTemplates(templates, 'global', selectedWorkspaceId)
    : [];
  const workspaceTemplates =
    canWriteWorkspace || role === 'po' || role === 'staff'
      ? scopeNutritionTemplates(templates, 'workspace', selectedWorkspaceId)
      : [];

  if (state === 'loading')
    return (
      <Card
        as="section"
        className={styles.state}
        aria-busy="true"
        dir={dirFor(locale)}
        lang={locale}
      >
        <p role="status">{m['nutritionTemplates.loading']}</p>
      </Card>
    );

  if (state === 'error')
    return (
      <Card
        as="section"
        className={styles.state}
        dir={dirFor(locale)}
        lang={locale}
      >
        <Alert tone="error" title={m['nutritionTemplates.errorTitle']}>
          <p>{m['nutritionTemplates.errorDescription']}</p>
        </Alert>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            {m['nutritionTemplates.retry']}
          </Button>
        )}
      </Card>
    );

  if (
    role === 'sales' ||
    (!canReadGlobalTemplates && !canManageWorkspaceTemplates)
  )
    return (
      <Card
        as="section"
        className={styles.state}
        dir={dirFor(locale)}
        lang={locale}
      >
        <h2>{m['nutritionTemplates.noAccess']}</h2>
      </Card>
    );

  function renderSection(
    scope: NutritionTemplate['scope'],
    title: string,
    entries: readonly NutritionTemplate[],
    page: number,
    canManage: boolean,
  ) {
    const result = paginateNutritionTemplates(entries, page, pageSize);
    return (
      <section
        className={styles.section}
        aria-labelledby={`${scope}-templates-title`}
      >
        <header className={styles.sectionHeader}>
          <h3 id={`${scope}-templates-title`}>{title}</h3>
          {canManage && onCreate && (
            <Button
              variant={scope === 'workspace' ? 'primary' : 'secondary'}
              onClick={() => onCreate(scope)}
            >
              {scope === 'global'
                ? m['nutritionTemplates.createGlobal']
                : m['nutritionTemplates.create']}
            </Button>
          )}
        </header>
        {result.items.length === 0 ? (
          <p className={styles.empty}>{m['nutritionTemplates.empty']}</p>
        ) : (
          <ul className={styles.list}>
            {result.items.map((template) => (
              <li key={template.id}>
                <Card
                  as="article"
                  className={styles.template}
                  data-testid="nutrition-template-row"
                >
                  <div className={styles.templateHeader}>
                    <div className={styles.templateTitle}>
                      <h4>{template.name[locale]}</h4>
                      {template.retired && (
                        <span className={styles.retired}>
                          {m['nutritionTemplates.retired']}
                        </span>
                      )}
                    </div>
                    {role === 'po' && template.origin && (
                      <p className={styles.origin}>
                        {m['nutritionTemplates.origin']}:{' '}
                        <Bidi>
                          {template.origin === 'Platform'
                            ? m['nutritionTemplates.platform']
                            : template.origin}
                        </Bidi>
                      </p>
                    )}
                  </div>
                  <ol
                    className={styles.versions}
                    aria-label={m['nutritionTemplates.versions']}
                  >
                    {template.versions.map(({ version }) => (
                      <li key={version}>
                        <span>
                          {m['nutritionTemplates.version']}{' '}
                          <Bidi dir="ltr">{formatDigits(version, locale)}</Bidi>
                        </span>
                        <Button
                          variant="secondary"
                          disabled={
                            template.retired ||
                            pendingAction === `${template.id}:${version}`
                          }
                          loading={
                            pendingAction === `${template.id}:${version}`
                          }
                          loadingLabel={m['nutritionTemplates.loading']}
                          onClick={() => {
                            const copy = copyNutritionTemplateVersion(
                              template,
                              version,
                            );
                            if (!copy) return;
                            const key = `${template.id}:${version}`;
                            setPendingAction(key);
                            setActionError(false);
                            void Promise.resolve(
                              onLoadIntoDraft({
                                templateId: copy.sourceTemplateId,
                                version: copy.sourceVersion,
                                document: copy.document,
                              }),
                            )
                              .then(() =>
                                setNotice(m['nutritionTemplates.loaded']),
                              )
                              .catch(() => setActionError(true))
                              .finally(() => setPendingAction(''));
                          }}
                        >
                          {m['nutritionTemplates.loadVersion']}{' '}
                          <Bidi dir="ltr">{formatDigits(version, locale)}</Bidi>
                        </Button>
                      </li>
                    ))}
                  </ol>
                  {canManage && !template.retired && (
                    <div className={styles.actions}>
                      {onCreateVersion && (
                        <Button
                          variant="secondary"
                          onClick={() => onCreateVersion(template)}
                        >
                          {m['nutritionTemplates.createVersion']}
                        </Button>
                      )}
                      {onRetire && (
                        <Button
                          variant="secondary"
                          onClick={() => onRetire(template)}
                        >
                          {m['nutritionTemplates.retire']}
                        </Button>
                      )}
                      {scope === 'workspace' &&
                        role === 'po' &&
                        template.eligibleForGlobal &&
                        onMakeItGlobal && (
                          <Button
                            variant="secondary"
                            onClick={() => onMakeItGlobal(template)}
                          >
                            {m['nutritionTemplates.makeGlobal']}
                          </Button>
                        )}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
        {result.totalPages > 1 && (
          <nav className={styles.pagination} aria-label={title}>
            <Button
              variant="secondary"
              disabled={result.page === 1}
              onClick={() =>
                setPages((current) => ({
                  ...current,
                  [scope]: current[scope] - 1,
                }))
              }
            >
              {m['nutritionTemplates.previous']}
            </Button>
            <span aria-live="polite">
              {m['nutritionTemplates.page']}{' '}
              <Bidi dir="ltr">{formatDigits(result.page, locale)}</Bidi>{' '}
              {m['nutritionTemplates.of']}{' '}
              <Bidi dir="ltr">{formatDigits(result.totalPages, locale)}</Bidi>
            </span>
            <Button
              variant="secondary"
              disabled={result.page === result.totalPages}
              onClick={() =>
                setPages((current) => ({
                  ...current,
                  [scope]: current[scope] + 1,
                }))
              }
            >
              {m['nutritionTemplates.next']}
            </Button>
          </nav>
        )}
      </section>
    );
  }

  return (
    <Card
      as="section"
      className={styles.manager}
      dir={dirFor(locale)}
      lang={locale}
      aria-labelledby="nutrition-template-manager-title"
      data-testid="nutrition-template-manager"
    >
      <header className={styles.header}>
        <div>
          <h2 id="nutrition-template-manager-title">
            {m['nutritionTemplates.title']}
          </h2>
          <p>{m['nutritionTemplates.intro']}</p>
        </div>
      </header>
      {canReadGlobalTemplates &&
        renderSection(
          'global',
          m['nutritionTemplates.global'],
          globalTemplates,
          pages.global,
          canWriteGlobal,
        )}
      {(canWriteWorkspace || role === 'po' || role === 'staff') &&
        renderSection(
          'workspace',
          m['nutritionTemplates.workspace'],
          workspaceTemplates,
          pages.workspace,
          canWriteWorkspace,
        )}
      <p className={styles.notice} role="status" aria-live="polite">
        {notice}
      </p>
      {actionError && (
        <Alert tone="error" title={m['nutritionTemplates.actionError']} />
      )}
    </Card>
  );
}
