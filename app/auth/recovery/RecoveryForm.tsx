'use client';

import { useActionState } from 'react';
import type { Messages } from '../../../lib/i18n';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Alert } from '../../../components/ui/Alert';
import { verifyRecovery, setNewPassword } from './actions';
import styles from './recovery.module.css';

function PasswordForm({ messages: m }: { messages: Messages }) {
  const [result, action, pending] = useActionState(setNewPassword, null);
  return (
    <form action={action} className={styles.stack}>
      <Field
        label={m['auth.newPassword']}
        inputProps={{
          name: 'password',
          type: 'password',
          autoComplete: 'new-password',
          required: true,
        }}
      />
      <Field
        label={m['auth.confirmPassword']}
        inputProps={{
          name: 'confirm',
          type: 'password',
          autoComplete: 'new-password',
          required: true,
        }}
      />
      {result && result.status !== 'ok' && (
        <Alert tone="error" title={m[`auth.${result.status}`]} />
      )}
      <Button
        type="submit"
        loading={pending}
        loadingLabel={m['button.loading']}
      >
        {m['auth.setPassword']}
      </Button>
    </form>
  );
}

export function RecoveryForm({
  tokenHash,
  messages: m,
}: {
  tokenHash: string | null;
  messages: Messages;
}) {
  const [result, action, pending] = useActionState(verifyRecovery, null);
  if (result?.status === 'ok') return <PasswordForm messages={m} />;
  if (!tokenHash || result?.status === 'invalid_link')
    return <Alert tone="error" title={m['auth.invalid_link']} />;
  return (
    <form action={action} className={styles.stack}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <Button
        type="submit"
        loading={pending}
        loadingLabel={m['button.loading']}
      >
        {m['auth.continue']}
      </Button>
    </form>
  );
}
