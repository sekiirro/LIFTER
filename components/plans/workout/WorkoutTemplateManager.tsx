'use client';

import { useMemo, useState } from 'react';
import type { Locale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { formatDigits } from '../../../lib/i18n/format-digits';
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
  type WorkoutTemplateManagementErrorCode,
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

/**
 * DESIGN.md Q48 asks for an inline pending affordance on save-style actions.
 * The preview has no stack round-trip, so a short deterministic delay stands in
 * for the future server acknowledgement.
 */
const PREVIEW_LATENCY_MS = 180;

const ERROR_MESSAGE_KEYS: Record<WorkoutTemplateManagementErrorCode, string> = {
  retired_template_not_loadable: 'templates.errorRetired',
  actor_not_authorized: 'templates.errorNotAuthorized',
  workspace_mismatch: 'templates.errorWorkspaceMismatch',
  name_required: 'templates.invalidName',
  global_governance_po_only: 'templates.errorGlobalGovernance',
  edit_not_allowed: 'templates.errorEditNotAllowed',
  retire_not_allowed: 'templates.errorRetireNotAllowed',
  promotion_not_allowed: 'templates.errorPromotionNotAllowed',
  promotion_not_eligible: 'templates.notEligible',
};

function previewDelay(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, PREVIEW_LATENCY_MS);
  });
}

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
  const [retireTarget, setRetireTarget] =
    useState<WorkoutTemplateProjection | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const pageResult = useMemo(
    () => listVisibleTemplates(actor, templates, page),
    [actor, page, templates],
  );
  const po = canManageGlobalTemplates(actor);

  function announce(text: string, tone: StatusMessage['tone'] = 'success') {
    setStatus({ tone, text });
  }

  function localizedError(error: unknown): string {
    if (error instanceof WorkoutTemplateManagementError) {
      const key = ERROR_MESSAGE_KEYS[error.code];
      if (key) return m[key as keyof typeof m];
    }
    return m['templates.errorUnknown'];
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

  async function saveTemplate() {
    if (!editor || pending) return;
    if (!editor.name.trim()) {
      setFormError(m['templates.invalidName']);
      return;
    }

    setPending('save');
    try {
      await previewDelay();
      if (editor.templateId) {
        const current = templates.find(
          (template) => template.id === editor.templateId,
        );
        if (!current) {
          setFormError(m['templates.errorTemplateNotFound']);
          return;
        }
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
      setFormError(localizedError(error));
    } finally {
      setPending(null);
    }
  }

  async function loadTemplate(template: WorkoutTemplateProjection) {
    if (!canLoadTemplate(actor, template) || pending) return;
    setPending(`load:${template.id}`);
    try {
      await previewDelay();
      setDraft((currentDraft) => loadTemplateIntoDraft(template, currentDraft));
      announce(m['templates.loaded']);
    } catch (error) {
      announce(localizedError(error), 'error');
    } finally {
      setPending(null);
    }
  }

  async function confirmRetire() {
    if (!retireTarget || pending) return;
    setPending('retire');
    try {
      await previewDelay();
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
      announce(localizedError(error), 'error');
    } finally {
      setPending(null);
    }
  }

  async function makeGlobal(template: WorkoutTemplateProjection) {
    if (pending) return;
    setPending(`promote:${template.id}`);
    try {
      await previewDelay();
      const promoted = promoteTemplateToGlobal(actor, template);
      setTemplates((currentTemplates) => [...currentTemplates, promoted]);
      announce(m['templates.promoted']);
    } catch (error) {
      announce(localizedError(error), 'error');
    } finally {
      setPending(null);
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
            {m['templates.selectedWorkspace']}:{' '}
            <Bidi dir="ltr">{actor.workspaceId}</Bidi>
          </p>
          <h2>{m['templates.listTitle']}</h2>
          <p>{m['templates.copyNotice']}</p>
        </div>
        <span className={styles.notice}>{m['templates.projectionNotice']}</span>
      </header>

      <div className={styles.toolbar}>
        <Button
          disabled={pending !== null}
          onClick={() => openCreate('workspace')}
        >
          {m['templates.createWorkspace']}
        </Button>
        {po ? (
          <div
            className={styles.governance}
            role="group"
            aria-label={m['templates.globalGovernance']}
          >
            <Button
              disabled={pending !== null}
              onClick={() => openCreate('global')}
            >
              {m['templates.createGlobal']}
            </Button>
          </div>
        ) : null}
      </div>

      {editor ? (
        <form
          className={styles.editor}
          onSubmit={(event) => {
            event.preventDefault();
            void saveTemplate();
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
            <Button
              type="submit"
              loading={pending === 'save'}
              loadingLabel={m['templates.saving']}
            >
              {m['templates.save']}
            </Button>
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
        <Alert
          tone={status.tone}
          title={status.text}
          data-testid="template-status"
        />
      ) : null}

      <section className={styles.list} aria-labelledby="template-list-title">
        <div className={styles.listHeader}>
          <h3 id="template-list-title">{m['templates.listTitle']}</h3>
          <p>
            {formatMessage(m['templates.templateCount'], {
              count: formatDigits(pageResult.total, locale),
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
                        <span className={styles.badge}>
                          {m['templates.readOnly']}
                        </span>
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
                        {formatDigits(template.version, locale)}
                      </Bidi>
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      data-template-action="load"
                      disabled={!loadable || pending !== null}
                      loading={pending === `load:${template.id}`}
                      loadingLabel={m['templates.loadingIntoDraft']}
                      aria-label={formatMessage(m['templates.loadNamed'], {
                        name: template.name,
                      })}
                      onClick={() => void loadTemplate(template)}
                    >
                      {m['templates.load']}
                    </Button>
                    {editable ? (
                      <Button
                        variant="secondary"
                        data-template-action="edit"
                        data-template-scope={template.scope}
                        disabled={pending !== null}
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
                        disabled={pending !== null}
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
                        disabled={
                          !template.promotionEligible || pending !== null
                        }
                        loading={pending === `promote:${template.id}`}
                        loadingLabel={m['templates.promoting']}
                        aria-label={formatMessage(
                          m['templates.makeGlobalNamed'],
                          {
                            name: template.name,
                          },
                        )}
                        onClick={() => void makeGlobal(template)}
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

        <nav
          className={styles.pagination}
          aria-label={m['templates.listTitle']}
        >
          <Button
            variant="secondary"
            disabled={pageResult.page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {m['templates.previous']}
          </Button>
          <span aria-live="polite">
            {formatMessage(m['templates.pageOf'], {
              page: formatDigits(pageResult.page, locale),
              total: formatDigits(Math.max(1, pageResult.pageCount), locale),
            })}
          </span>
          <Button
            variant="secondary"
            disabled={pageResult.page >= pageResult.pageCount}
            onClick={() =>
              setPage((current) => Math.min(pageResult.pageCount, current + 1))
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
                  count: formatDigits(draft.days.length, locale),
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
        loading={pending === 'retire'}
        onConfirm={() => void confirmRetire()}
        onCancel={() => setRetireTarget(null)}
      />
    </section>
  );
}
