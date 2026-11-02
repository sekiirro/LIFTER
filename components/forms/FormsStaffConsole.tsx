'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandScope } from '../ui/BrandScope';
import { Button } from '../ui/Button';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { canManageWorkspaceForms } from '../../lib/forms/staff-policy';
import type {
  FormsStaffAdapter,
  FormsStaffRole,
  FormsStaffSnapshot,
  FormsWorkspaceBrandSource,
  StaffFormDraft,
} from '../../lib/forms/staff-contracts';
import { FormBuilder } from './FormBuilder';
import { StaffIntake } from './StaffIntake';
import { StaffSlaAlerts } from './StaffSlaAlerts';
import styles from './StaffForms.module.css';

type StaffView = 'builder' | 'intake' | 'alerts';

function blankDraft(id: string): StaffFormDraft {
  return {
    id,
    title: { en: '', ar: '' },
    sections: [],
    questions: [],
    deadlineDays: 3,
    status: 'draft',
    revision: 0,
  };
}

export function FormsStaffConsole({
  locale,
  adapter,
  brandSource,
  workspaceId = 'showcase-workspace',
  workspaces = [],
  actorRole,
  demo = true,
}: {
  locale: Locale;
  adapter: FormsStaffAdapter;
  brandSource: FormsWorkspaceBrandSource;
  workspaceId?: string;
  workspaces?: readonly { id: string; name: string }[];
  actorRole?: FormsStaffRole;
  demo?: boolean;
}) {
  const router = useRouter();
  const messages = getMessages(locale);
  const [snapshot, setSnapshot] = useState<FormsStaffSnapshot | null>(null);
  const [brandColor, setBrandColor] = useState<string | null>(null);
  const [view, setView] = useState<StaffView>('builder');
  const [role, setRole] = useState<FormsStaffRole>(actorRole ?? 'trainer');
  const [form, setForm] = useState<StaffFormDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const forms = snapshot?.forms ?? [];
  const activeForm = form ?? null;
  const canManage = canManageWorkspaceForms(role);

  useEffect(() => {
    let active = true;
    Promise.all([
      adapter.load(),
      brandSource.resolvePublishedColor(workspaceId),
    ])
      .then(([loaded, color]) => {
        if (!active) return;
        setSnapshot(loaded);
        setForm(
          loaded.forms.find(
            (item) => item.id === loaded.defaultOnboardingFormId,
          ) ?? null,
        );
        setBrandColor(color);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [adapter, brandSource, workspaceId]);

  const policies = useMemo(
    () => [
      {
        id: 'builder' as const,
        label: messages['forms.staffBuilder'],
      },
      {
        id: 'intake' as const,
        label: messages['forms.staffIntake'],
      },
      {
        id: 'alerts' as const,
        label: messages['forms.staffSlaAlerts'],
      },
    ],
    [messages],
  );

  function acceptResult(
    result: Awaited<ReturnType<FormsStaffAdapter['saveDraft']>>,
    success: string,
  ) {
    if (result.status !== 'ok') {
      setIssue(messages[`forms.staffResult.${result.status}`]);
      setStatusMessage('');
      return null;
    }
    setIssue('');
    setStatusMessage(success);
    setForm(result.form);
    setSnapshot((current) => ({
      forms: [
        ...(current?.forms.filter((item) => item.id !== result.form.id) ?? []),
        result.form,
      ],
      assignments: current?.assignments ?? [],
      defaultOnboardingFormId: current?.defaultOnboardingFormId ?? null,
      defaultConfigurationError: current?.defaultConfigurationError ?? false,
    }));
    return result.form;
  }

  async function saveDraft() {
    if (!form) return;
    setBusy(true);
    setIssue('');
    const result = await adapter.saveDraft(role, form);
    acceptResult(result, messages['forms.staffSaved']);
    setBusy(false);
  }

  async function publish() {
    if (!form) return;
    setBusy(true);
    setIssue('');
    const saved = await adapter.saveDraft(role, form);
    if (saved.status !== 'ok') {
      acceptResult(saved, '');
      setBusy(false);
      return;
    }
    const published = await adapter.publish(role, saved.form.id);
    acceptResult(published, messages['forms.staffPublished']);
    setBusy(false);
  }

  async function retire() {
    if (!form) return;
    setBusy(true);
    setIssue('');
    acceptResult(
      await adapter.retire(role, form.id),
      messages['forms.staffRetired'],
    );
    setBusy(false);
  }

  async function copy(formId: string) {
    setBusy(true);
    setIssue('');
    const result = await adapter.copy(role, formId);
    const copied = acceptResult(result, messages['forms.staffCopied']);
    if (copied) setView('builder');
    setBusy(false);
  }

  async function selectDefaultOnboardingForm(formId: string) {
    setBusy(true);
    setIssue('');
    const result = await adapter.selectDefaultOnboardingForm(role, formId);
    if (result.status !== 'ok') {
      const messageStatus =
        result.status === 'unavailable' ? 'missing' : result.status;
      setIssue(messages[`forms.staffResult.${messageStatus}`]);
      setStatusMessage('');
    } else {
      const selectedForm = snapshot?.forms.find((item) => item.id === formId);
      if (selectedForm) setForm(selectedForm);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              defaultOnboardingFormId: formId,
              defaultConfigurationError: false,
            }
          : current,
      );
      setStatusMessage(messages['forms.staffSaved']);
    }
    setBusy(false);
  }

  async function create() {
    if (!canManage) {
      setIssue(messages['forms.staffSalesDenied']);
      return;
    }
    const next = blankDraft(
      demo ? `mock-form-${Date.now()}` : globalThis.crypto.randomUUID(),
    );
    setForm(next);
    setIssue('');
    setStatusMessage('');
  }

  if (snapshot === null && !loadFailed) {
    return (
      <main className={styles.main} aria-busy="true">
        <h1>{messages['forms.staffTitle']}</h1>
        <p role="status">{messages['forms.staffLoading']}</p>
      </main>
    );
  }

  const content = (
    <main className={styles.main}>
      <header className={styles.pageHeader}>
        <div>
          <h1>{messages['forms.staffTitle']}</h1>
          {demo && <p>{messages['forms.staffDescription']}</p>}
        </div>
        {demo && (
          <label className={styles.roleField}>
            <span>{messages['forms.staffPreviewRole']}</span>
            <select
              value={role}
              onChange={(event) => {
                setRole(event.currentTarget.value as FormsStaffRole);
                setIssue('');
              }}
            >
              {(['po', 'wo', 'trainer', 'sales'] as const).map((item) => (
                <option key={item} value={item}>
                  {messages[`forms.staffRole.${item}`]}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {!demo && workspaces.length > 1 && (
        <label className={styles.field}>
          <span>{messages['packages.workspace']}</span>
          <select
            aria-label={messages['packages.workspace']}
            value={workspaceId}
            onChange={(event) =>
              router.push(
                `/forms?workspace=${encodeURIComponent(event.currentTarget.value)}`,
              )
            }
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {demo && (
        <p className={styles.previewNotice} role="note">
          {messages['forms.staffMockPreview']}
        </p>
      )}

      {snapshot?.defaultConfigurationError && (
        <p className={styles.error} role="alert">
          {messages['forms.staffDefaultConfigurationError']}
        </p>
      )}

      {demo && (
        <div
          className={styles.viewPicker}
          role="group"
          aria-label={messages['forms.staffViews']}
        >
          {policies.map((item) => (
            <Button
              key={item.id}
              variant="secondary"
              className={view === item.id ? styles.activeView : undefined}
              aria-pressed={view === item.id}
              onClick={() => {
                setView(item.id);
                setIssue('');
                setStatusMessage('');
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}

      {loadFailed ? (
        <p className={styles.error} role="alert">
          {messages['forms.staffLoadFailed']}
        </p>
      ) : (
        <>
          {view === 'builder' && (
            <FormBuilder
              locale={locale}
              actorRole={role}
              form={activeForm}
              allForms={forms}
              defaultOnboardingFormId={
                snapshot?.defaultOnboardingFormId ?? null
              }
              busy={busy}
              issue={issue}
              statusMessage={statusMessage}
              onChange={setForm}
              onCreate={() => void create()}
              onSelectForm={setForm}
              onSetDefaultOnboardingForm={(formId) =>
                void selectDefaultOnboardingForm(formId)
              }
              onSave={() => void saveDraft()}
              onPublish={() => void publish()}
              onRetire={() => void retire()}
              onCopy={(formId) => void copy(formId)}
              onIssue={setIssue}
            />
          )}
          {demo && view === 'intake' && (
            <StaffIntake
              locale={locale}
              assignments={snapshot?.assignments ?? []}
            />
          )}
          {demo && view === 'alerts' && (
            <StaffSlaAlerts
              locale={locale}
              assignments={snapshot?.assignments ?? []}
            />
          )}
        </>
      )}
    </main>
  );
  return brandColor ? (
    <BrandScope color={brandColor}>{content}</BrandScope>
  ) : (
    content
  );
}
