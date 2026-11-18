'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Field } from '../../../components/ui/Field';
import type { Locale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { createWorkspaceAction } from './actions';
import styles from './workspaces.module.css';

export function workspaceSlugFromName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
}

export function WorkspacesManager({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const formRef = useRef<HTMLFormElement>(null);
  const requestId = useRef<string | null>(null);
  const slugManuallyEdited = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState('');
  const [nameInvalid, setNameInvalid] = useState(false);
  const [slug, setSlug] = useState('');
  const [feedback, setFeedback] = useState<'created' | 'error' | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const nameInput = formRef.current?.elements.namedItem(
      'name',
    ) as HTMLInputElement | null;
    if (name.trim().length === 0 || [...name].length > 120) {
      setNameInvalid(true);
      nameInput?.focus();
      return;
    }
    setNameInvalid(false);
    if (!event.currentTarget.reportValidity()) return;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    setPending(true);
    setFeedback(null);
    try {
      const result = await createWorkspaceAction({
        id: requestId.current,
        name,
        slug,
      });
      if (result.status === 'created' || result.status === 'existing') {
        requestId.current = null;
        slugManuallyEdited.current = false;
        setName('');
        setSlug('');
        setOpen(false);
        setFeedback('created');
      } else setFeedback('error');
    } catch {
      setFeedback('error');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.main}>
      <h1>{m['workspaces.title']}</h1>
      {feedback === 'created' && (
        <Alert tone="success" title={m['workspaces.created']} />
      )}
      <div className={styles.actions}>
        <Button
          onClick={() => {
            setFeedback(null);
            setOpen(true);
          }}
        >
          {m['workspaces.new']}
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        title={m['workspaces.createTitle']}
        description={m['workspaces.createDescription']}
        confirmLabel={m['workspaces.create']}
        cancelLabel={m['dialog.cancel']}
        loading={pending}
        onConfirm={() => formRef.current?.requestSubmit()}
        onCancel={() => {
          setOpen(false);
          setFeedback(null);
        }}
      >
        <form
          ref={formRef}
          className={styles.form}
          onSubmit={(event) => void submit(event)}
        >
          {feedback === 'error' && (
            <Alert tone="error" title={m['workspaces.error']} />
          )}
          <Field
            label={m['workspaces.nameLabel']}
            error={nameInvalid ? m['workspaces.nameInvalid'] : undefined}
            inputProps={{
              name: 'name',
              value: name,
              maxLength: 120,
              disabled: pending,
              autoComplete: 'off',
              onChange: (event) => {
                setNameInvalid(false);
                const nextName = event.target.value;
                setName(nextName);
                if (!slugManuallyEdited.current)
                  setSlug(workspaceSlugFromName(nextName));
              },
            }}
          />
          <Field
            label={m['workspaces.slugLabel']}
            hint={m['workspaces.slugHint']}
            inputProps={{
              name: 'slug',
              value: slug,
              required: true,
              maxLength: 50,
              disabled: pending,
              pattern: '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?',
              autoComplete: 'off',
              onChange: (event) => {
                slugManuallyEdited.current = true;
                setSlug(event.target.value);
              },
            }}
          />
        </form>
      </ConfirmDialog>
    </main>
  );
}
