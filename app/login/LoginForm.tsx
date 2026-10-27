'use client';

import { useActionState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Alert } from '../../components/ui/Alert';
import type { Messages } from '../../lib/i18n';
import { signIn } from './actions';
import styles from './login.module.css';

export function LoginForm({
  next,
  messages: m,
}: {
  next: string;
  messages: Messages;
}) {
  const [result, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className={styles.stack}>
      <input type="hidden" name="next" value={next} />
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
      <Field
        label={m['auth.password']}
        inputProps={{
          name: 'password',
          type: 'password',
          autoComplete: 'current-password',
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
        {m['auth.signIn']}
      </Button>
    </form>
  );
}
