'use client';

import { useMemo, useState } from 'react';
import type { Locale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import type { WorkoutDocument } from '../../../lib/plans/workout/schema';
import {
  canEditTemplate,
  canLoadTemplate,
  canManageGlobalTemplates,
  createGlobalTemplate,
  createWorkspaceTemplate,
  editTemplate,
  listVisibleTemplates,
  loadTemplateIntoDraft,
  promoteTemplateToGlobal,
  retireTemplate,
  WorkoutTemplateManagementError,
  type WorkoutTemplateActor,
  type WorkoutTemplateProjection,
  type WorkoutTemplateScope,
} from '../../../lib/plans/workout/template-management';
import { Alert } from '../../ui/Alert';
import { Bidi } from '../../ui/Bidi';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Field } from '../../ui/Field';
import styles from './WorkoutTemplateManager.module.css';

type TemplateEditor = {
  scope: WorkoutTemplateScope;
  templateId?: string;
  name: string;
  description: string;
};

type StatusMessage = {
  tone: 'success' | 'error';
  text: string;
};

export type WorkoutTemplateManagerProps = {
  actor: WorkoutTemplateActor;
  templates: readonly WorkoutTemplateProjection[];
  initialDraft: WorkoutDocument;
  locale: Locale;
};

function formatMessage(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

function restDayDocument(title: string): WorkoutDocument {
  return {
    days: [
      {
        id: crypto.randomUUID(),
        kind: 'rest',
        title,
      },
    ],
  };
}

export function WorkoutTemplateManager({
  actor,
  templates: initialTemplates,
  initialDraft,
  locale,
}: WorkoutTemplateManagerProps) {
  const m = getMessages(locale);
  const [templates, setTemplates] = useState(initialTemplates);
  const [draft, setDraft] = useState(initialDraft);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<TemplateEditor | null>(null);
  const [retireTarget, setRetireTarget] = useState<WorkoutTemplateProjection | null>(
    null,
  );
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const pageResult = useMemo(
    () => listVisibleTemplates(actor, templates, page),
    [actor, page, templates],
  );
  const po = canManageGlobalTemplates(actor);

  function announce(text: string, tone: StatusMessage['tone'] = 'success') {
    setStatus({ tone, text });
  }

  function openCreate(scope: WorkoutTemplateScope) {
    setFormError(null);
    setEditor({ scope, name: '', description: '' });
  }

  function openEdit(template: WorkoutTemplateProjection) {
    if (!canEditTemplate(actor, template)) return;
    setFormError(null);
    setEditor({
      scope: template.scope,
      templateId: template.id,
      name: template.name,
      description: template.description ?? '',
    });
  }

  function saveTemplate() {
    if (!editor) return;
    if (!editor.name.trim()) {
      setFormError(m['templates.invalidName']);
      return;
    }

    try {
      if (editor.templateId) {
        const current = templates.find(
          (template) => template.id === editor.templateId,
        );
        if (!current) throw new WorkoutTemplateManagementError('Template not found');
        const updated = editTemplate(actor, current, {
          name: editor.name,
          description: editor.description,
          document: current.document,
        });
        setTemplates((currentTemplates) =>
          currentTemplates.map((template) =>
            template.id === updated.id ? updated : template,
          ),
        );
        announce(m['templates.updated']);
      } else if (editor.scope === 'global') {
        const created = createGlobalTemplate(actor, {
          name: editor.name,
          description: editor.description,
          document: restDayDocument(editor.name),
        });
        setTemplates((currentTemplates) => [...currentTemplates, created]);
        announce(m['templates.created']);
      } else {
        const created = createWorkspaceTemplate(actor, {
          workspaceId: actor.workspaceId,
          name: editor.name,
          description: editor.description,
          document: restDayDocument(editor.name),
        });
        setTemplates((currentTemplates) => [...currentTemplates, created]);
        announce(m['templates.created']);
      }
      setEditor(null);
      setFormError(null);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : m['templates.invalidName'],
      );
    }
  }

  function loadTemplate(template: WorkoutTemplateProjection) {
    if (!canLoadTemplate(actor, template)) return;
    try {
      setDraft((currentDraft) => loadTemplateIntoDraft(template, currentDraft));
      announce(m['templates.loaded']);
    } catch (error) {
      announce(
        error instanceof Error ? error.message : m['templates.invalidName'],
        'error',
      );
    }
  }

  function confirmRetire() {
    if (!retireTarget) return;
    try {
      const retired = retireTemplate(actor, retireTarget);
      setTemplates((currentTemplates) =>
        currentTemplates.map((template) =>
          template.id === retired.id ? retired : template,
        ),
      );
      setRetireTarget(null);
      announce(m['templates.retiredMessage']);
    } catch (error) {
      setRetireTarget(null);
      announce(
        error instanceof Error ? error.message : m['templates.invalidName'],
        'error',
      );
    }
  }

  function makeGlobal(template: WorkoutTemplateProjection) {
    try {
      const promoted = promoteTemplateToGlobal(actor, template);
      setTemplates((currentTemplates) => [...currentTemplates, promoted]);
      announce(m['templates.promoted']);
    } catch (error) {
      announce(
        error instanceof Error ? error.message : m['templates.notEligible'],
        'error',
      );
    }
  }

  return (
    <section
      className={styles.manager}
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-testid="workout-template-manager"
      data-page-size={pageResult.pageSize}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.context}>
            {po ? m['templates.poView'] : m['templates.staffView']} ·{' '}
            {m['templates.selectedWorkspace']}: {actor.workspaceId}
          </p>
          <h2>{m['templates.listTitle']}</h2>
          <p>{m['templates.copyNotice']}</p>
        </div>
        <span className={styles.notice}>{m['templates.projectionNotice']}</span>
      </header>

      <div className={styles.toolbar}>
        <Button onClick={() => openCreate('workspace')}>
          {m['templates.createWorkspace']}
        </Button>
        {po ? (
          <Button onClick={() => openCreate('global')}>
            {m['templates.createGlobal']}
          </Button>
        ) : null}
      </div>

      {editor ? (
        <form
          className={styles.editor}
          onSubmit={(event) => {
            event.preventDefault();
            saveTemplate();
          }}
          aria-labelledby="template-editor-title"
        >
          <h3 id="template-editor-title">
            {editor.scope === 'global'
              ? m['templates.editorTitleGlobal']
              : m['templates.editorTitleWorkspace']}
          </h3>
          <Field
            label={m['templates.name']}
            hint={m['templates.nameHint']}
            error={formError ?? undefined}
            inputProps={{
              value: editor.name,
              required: true,
              onChange: (event) => {
                const value = event.currentTarget.value;
                setEditor((current) =>
                  current ? { ...current, name: value } : current,
                );
              },
            }}
          />
          <label className={styles.textareaLabel}>
            {m['templates.description']}
            <textarea
              value={editor.description}
              rows={3}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setEditor((current) =>
                  current ? { ...current, description: value } : current,
                );
              }}
            />
          </label>
          <div className={styles.actions}>
            <Button type="submit">{m['templates.save']}</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEditor(null);
                setFormError(null);
              }}
            >
              {m['templates.cancel']}
            </Button>
          </div>
        </form>
      ) : null}

      {status ? (
        <Alert tone={status.tone} title={status.text} data-testid="template-status" />
      ) : null}

      <section className={styles.list} aria-labelledby="template-list-title">
        <div className={styles.listHeader}>
          <h3 id="template-list-title">{m['templates.listTitle']}</h3>
          <p>
            {formatMessage(m['templates.templateCount'], {
              count: formatNumber(pageResult.total, locale),
            })}
          </p>
        </div>

        {pageResult.items.length === 0 ? (
          <p className={styles.empty}>{m['templates.empty']}</p>
        ) : (
          <ul className={styles.templates}>
            {pageResult.items.map((template) => {
              const editable = canEditTemplate(actor, template);
              const loadable = canLoadTemplate(actor, template);
              const scopeLabel =
                template.scope === 'global'
                  ? m['templates.globalScope']
                  : m['templates.workspaceScope'];
              const statusLabel =
                template.status === 'active'
                  ? m['templates.active']
                  : m['templates.retired'];
              return (
                <li
                  className={styles.template}
                  key={template.id}
                  data-testid={`template-${template.id}`}
                  data-template-scope={template.scope}
                  data-template-status={template.status}
                >
                  <div className={styles.templateMain}>
                    <div className={styles.badges}>
                      <span className={styles.badge}>{scopeLabel}</span>
                      <span
                        className={styles.badge}
                        data-status={template.status}
                      >
                        {statusLabel}
                      </span>
                      {template.scope === 'global' && !po ? (
                        <span className={styles.badge}>{m['templates.readOnly']}</span>
                      ) : null}
                    </div>
                    <h4>
                      <Bidi dir="auto">{template.name}</Bidi>
                    </h4>
                    {template.description ? (
                      <p className={styles.description}>
                        <Bidi dir="auto">{template.description}</Bidi>
                      </p>
                    ) : null}
                    <p className={styles.version}>
                      {m['templates.version']}:{' '}
                      <Bidi dir="ltr">
                        {formatNumber(template.version, locale)}
                      </Bidi>
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      data-template-action="load"
                      disabled={!loadable}
                      aria-label={formatMessage(m['templates.loadNamed'], {
                        name: template.name,
                      })}
                      onClick={() => loadTemplate(template)}
                    >
                      {m['templates.load']}
                    </Button>
                    {editable ? (
                      <Button
                        variant="secondary"
                        data-template-action="edit"
                        data-template-scope={template.scope}
                        aria-label={formatMessage(m['templates.editNamed'], {
                          name: template.name,
                        })}
                        onClick={() => openEdit(template)}
                      >
                        {m['templates.edit']}
                      </Button>
                    ) : null}
                    {editable ? (
                      <Button
                        variant="destructive"
                        data-template-action="retire"
                        data-template-scope={template.scope}
                        aria-label={formatMessage(m['templates.retireNamed'], {
                          name: template.name,
                        })}
                        onClick={() => setRetireTarget(template)}
                      >
                        {m['templates.retire']}
                      </Button>
                    ) : null}
                    {po && template.scope === 'workspace' ? (
                      <Button
                        variant="secondary"
                        data-template-action="make-global"
                        disabled={!template.promotionEligible}
                        aria-label={formatMessage(m['templates.makeGlobalNamed'], {
                          name: template.name,
                        })}
                        onClick={() => makeGlobal(template)}
                      >
                        {m['templates.makeGlobal']}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <nav className={styles.pagination} aria-label={m['templates.listTitle']}>
          <Button
            variant="secondary"
            disabled={pageResult.page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {m['templates.previous']}
          </Button>
          <span aria-live="polite">
            {formatMessage(m['templates.pageOf'], {
              page: formatNumber(pageResult.page, locale),
              total: formatNumber(Math.max(1, pageResult.pageCount), locale),
            })}
          </span>
          <Button
            variant="secondary"
            disabled={pageResult.page >= pageResult.pageCount}
            onClick={() =>
              setPage((current) =>
                Math.min(pageResult.pageCount, current + 1),
              )
            }
          >
            {m['templates.next']}
          </Button>
        </nav>
      </section>

      <section className={styles.draft} aria-labelledby="draft-preview-title">
        <div className={styles.listHeader}>
          <h3 id="draft-preview-title">{m['templates.draftTitle']}</h3>
          <p>
            {draft.days.length === 0
              ? m['templates.draftEmpty']
              : formatMessage(m['templates.draftDays'], {
                  count: formatNumber(draft.days.length, locale),
                })}
          </p>
        </div>
        {draft.days.length > 0 ? (
          <ul className={styles.draftDays} data-testid="draft-copy">
            {draft.days.map((day) => (
              <li key={day.id} data-draft-day-id={day.id}>
                {formatMessage(m['templates.draftDay'], {
                  name: day.title ?? day.id,
                })}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <ConfirmDialog
        open={retireTarget !== null}
        title={m['templates.confirmRetireTitle']}
        description={m['templates.confirmRetireDescription']}
        confirmLabel={m['templates.confirmRetire']}
        cancelLabel={m['templates.cancel']}
        tone="destructive"
        onConfirm={confirmRetire}
        onCancel={() => setRetireTarget(null)}
      />
    </section>
  );
}
