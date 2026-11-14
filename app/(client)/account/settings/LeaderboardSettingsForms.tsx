'use client';

import { useActionState } from 'react';
import styles from '../../../../components/leaderboard/leaderboard.module.css';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { Field } from '../../../../components/ui/Field';
import type { OptOutStatus } from '../../../../lib/leaderboard/service';
import type { UsernameUpdateStatus } from '../../../../lib/leaderboard/username';
import type { OptOutActionState, UsernameActionState } from './actions';

export type UsernameFormMessages = {
  label: string;
  save: string;
  /** Existing approved generic confirmation (reused catalog key). */
  saved: string;
  /** Existing approved generic failure (reused catalog key). */
  failed: string;
  tooShort: string;
  tooLong: string;
  invalidChars: string;
  reserved: string;
  workspaceTaken: string;
};

export function usernameErrorMessage(
  status: UsernameUpdateStatus | 'idle',
  messages: UsernameFormMessages,
): string | undefined {
  switch (status) {
    case 'too_short':
      return messages.tooShort;
    case 'too_long':
      return messages.tooLong;
    case 'invalid_chars':
      return messages.invalidChars;
    case 'reserved':
      return messages.reserved;
    case 'taken':
      return messages.workspaceTaken;
    default:
      return undefined;
  }
}

/** Form-level feedback: a saved notice, or a failure that is not a field error. */
export function usernameNotice(
  status: UsernameUpdateStatus | 'idle',
  messages: UsernameFormMessages,
): { tone: 'success' | 'error'; title: string } | null {
  if (status === 'updated' || status === 'unchanged')
    return { tone: 'success', title: messages.saved };
  if (status === 'unavailable' || status === 'not_permitted')
    return { tone: 'error', title: messages.failed };
  return null;
}

export function UsernameForm({
  action,
  currentUsername,
  messages,
}: {
  action: (
    previous: UsernameActionState,
    formData: FormData,
  ) => Promise<UsernameActionState>;
  currentUsername: string;
  messages: UsernameFormMessages;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: 'idle',
  } satisfies UsernameActionState);
  const notice = usernameNotice(state.status, messages);
  return (
    <form action={formAction} className={styles.form} noValidate>
      <Field
        label={messages.label}
        error={usernameErrorMessage(state.status, messages)}
        inputProps={{
          name: 'username',
          defaultValue: currentUsername,
          autoComplete: 'username',
          dir: 'ltr',
          required: true,
          disabled: pending,
        }}
      />
      <Button type="submit" disabled={pending}>
        {messages.save}
      </Button>
      {notice && <Alert tone={notice.tone} title={notice.title} />}
    </form>
  );
}

export function optOutFailed(status: OptOutStatus | 'idle'): boolean {
  return status === 'unavailable' || status === 'not_permitted';
}

export function OptOutForm({
  action,
  label,
  successMessage,
  failedMessage,
}: {
  action: (
    previous: OptOutActionState,
    formData: FormData,
  ) => Promise<OptOutActionState>;
  label: string;
  successMessage: string;
  failedMessage: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: 'idle',
  } satisfies OptOutActionState);
  if (state.status === 'opted_out' || state.status === 'already_opted_out')
    return <Alert tone="success" title={successMessage} />;
  return (
    <form action={formAction} className={styles.form}>
      <Button type="submit" variant="secondary" disabled={pending}>
        {label}
      </Button>
      {optOutFailed(state.status) && (
        <Alert tone="error" title={failedMessage} />
      )}
    </form>
  );
}
