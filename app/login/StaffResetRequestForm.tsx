'use client';

import { useActionState } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import type { Messages } from '../../lib/i18n';
import { requestStaffReset } from './actions';
import styles from './login.module.css';

export function StaffResetStatus({
  status,
  messages: m,
}: {
  status: 'ok' | 'invalidEmail';
  messages: Messages;
}) {
  return status === 'ok' ? (
    <Alert tone="success" title={m['auth.staffResetConfirm']} />
  ) : (
    <Alert tone="error" title={m['auth.invalidEmail']} />
  );
}

export function StaffResetRequestForm({ messages: m }: { messages: Messages }) {
  const [result, action, pending] = useActionState(requestStaffReset, null);
  return (
    <section className={styles.stack} aria-labelledby="staff-reset-title">
      <div className={styles.stack}>
        <h2 id="staff-reset-title">{m['auth.staffResetTitle']}</h2>
        <p>{m['auth.staffResetHelp']}</p>
      </div>
      <form action={action} className={styles.stack}>
        <Field
          label={m['auth.email']}
          inputProps={{
            name: 'email',
            type: 'email',
            autoComplete: 'email',
            required: true,
            dir: 'ltr',
          }}
        />
        {result && <StaffResetStatus status={result.status} messages={m} />}
        <Button
          type="submit"
          loading={pending}
          loadingLabel={m['auth.sendingReset']}
        >
          {m['auth.requestReset']}
        </Button>
      </form>
    </section>
  );
}
