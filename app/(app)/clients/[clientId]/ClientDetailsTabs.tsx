'use client';

import { useRouter } from 'next/navigation';
import { ToastProvider, useToast } from '../../../../components/ui/Toast';
import {
  ClientNotes,
  type ClientNote,
  type ClientNotesStatus,
} from '../../../../components/client-notes/ClientNotes';
import { dirFor, type Locale } from '../../../../lib/design/preferences';
import type { getMessages } from '../../../../lib/i18n';
import {
  createClientNoteAction,
  deleteClientNoteAction,
  updateClientNoteAction,
} from './actions';
import styles from './ClientDetailsTabs.module.css';

type Messages = ReturnType<typeof getMessages>;

type ClientDetailsTabsProps = {
  clientId: string;
  workspaceId: string;
  actorId: string;
  role: string;
  locale: Locale;
  messages: Messages;
  notes: readonly ClientNote[];
  status: ClientNotesStatus;
};

export function ClientDetailsTabs(props: ClientDetailsTabsProps) {
  return (
    <ToastProvider dismissLabel={props.messages['toast.dismiss']}>
      <ClientDetailsTabsContent {...props} />
    </ToastProvider>
  );
}

function ClientDetailsTabsContent({
  clientId,
  workspaceId,
  actorId,
  role,
  locale,
  messages,
  notes,
  status,
}: ClientDetailsTabsProps) {
  const router = useRouter();
  const toast = useToast();

  return (
    <main className={styles.page} dir={dirFor(locale)} lang={locale}>
      <div
        className={styles.tabList}
        role="tablist"
        aria-label={messages['clientNotes.tab']}
      >
        <button
          className={styles.tab}
          type="button"
          role="tab"
          id="client-notes-tab"
          aria-controls="client-notes-panel"
          aria-selected="true"
          tabIndex={0}
        >
          {messages['clientNotes.tab']}
        </button>
      </div>
      <div
        className={styles.panel}
        role="tabpanel"
        id="client-notes-panel"
        aria-labelledby="client-notes-tab"
        tabIndex={0}
      >
        <ClientNotes
          clientId={clientId}
          workspaceId={workspaceId}
          locale={locale}
          messages={messages}
          notes={notes}
          status={status}
          actorId={actorId}
          role={role}
          canCreate
          onSuccess={(action) =>
            toast.success(
              action === 'created'
                ? messages['clientNotes.createdToast']
                : action === 'edited'
                  ? messages['clientNotes.editedToast']
                  : messages['clientNotes.deletedToast'],
            )
          }
          onRetryLoad={() => router.refresh()}
          onCreate={(body, idempotencyKey) =>
            createClientNoteAction({
              clientId,
              workspaceId,
              body,
              idempotencyKey,
            })
          }
          onUpdate={(noteId, body) => updateClientNoteAction({ noteId, body })}
          onDelete={(noteId) => deleteClientNoteAction({ noteId })}
        />
      </div>
    </main>
  );
}
