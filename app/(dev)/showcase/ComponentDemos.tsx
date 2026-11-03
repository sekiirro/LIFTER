'use client';

import { useState } from 'react';
import { RecoveryLinkDialog } from '../../../components/auth/RecoveryLinkDialog';
import type { Messages } from '../../../lib/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Bidi } from '../../../components/ui/Bidi';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Field } from '../../../components/ui/Field';
import {
  EmptyState,
  ErrorState,
  NoResults,
  Skeleton,
} from '../../../components/ui/States';
import { useToast } from '../../../components/ui/Toast';
import { GlassPopoverMenu } from '../../../components/ui/glass/GlassPopoverMenu';
import styles from './showcase.module.css';

export function ComponentDemos({ messages: m }: { messages: Messages }) {
  const [open, setOpen] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [retries, setRetries] = useState(0);
  const toast = useToast();
  return (
    <>
      <section className={styles.section} aria-labelledby="recovery-title">
        <h2 id="recovery-title">{m['auth.recoveryTitle']}</h2>
        <RecoveryLinkDialog
          targetUserId="00000000-0000-0000-0000-000000000001"
          messages={m}
          action={async () => ({
            status: 'ok',
            link: 'https://example.test/auth/recovery?token_hash=demo&type=recovery',
          })}
        />
      </section>
      <section
        id="buttons"
        aria-labelledby="buttons-title"
        className={styles.section}
      >
        <h2 id="buttons-title">{m['showcase.buttons']}</h2>
        <div className={styles.row}>
          <Button
            data-testid="primary-button"
            onClick={() => setClicks((v) => v + 1)}
          >
            {m['button.primary']}
          </Button>
          <Button variant="secondary">{m['button.secondary']}</Button>
          <Button variant="destructive">{m['button.destructive']}</Button>
        </div>
        <div className={styles.row}>
          {(['primary', 'secondary', 'destructive'] as const).map((variant) => (
            <Button key={variant} variant={variant} disabled>
              {m['showcase.disabled']}
            </Button>
          ))}
        </div>
        <div className={styles.row}>
          {(['primary', 'secondary', 'destructive'] as const).map((variant) => (
            <Button
              key={variant}
              variant={variant}
              loading
              loadingLabel={m['button.loading']}
              data-testid={`loading-${variant}`}
              onClick={() => setClicks((v) => v + 1)}
            >
              {m[`button.${variant}`]}
            </Button>
          ))}
        </div>
        <p>
          {m['showcase.clickCount']}:{' '}
          <Bidi>
            <span data-testid="click-count">{clicks}</span>
          </Bidi>
        </p>
      </section>
      <section
        id="glass-menu"
        aria-labelledby="glass-menu-title"
        className={styles.section}
      >
        <h2 id="glass-menu-title">Glass popover menu</h2>
        <GlassPopoverMenu
          label="Showcase actions"
          triggerLabel="Open showcase actions"
          trigger="Actions"
          items={[
            { label: 'First action', href: '#first-action' },
            { label: 'Second action', href: '#second-action' },
          ]}
        />
      </section>
      <section
        id="fields"
        aria-labelledby="fields-title"
        className={styles.section}
      >
        <h2 id="fields-title">{m['showcase.fields']}</h2>
        <form
          className={styles.stack}
          onSubmit={(event) => event.preventDefault()}
        >
          <Field
            label={m['showcase.fieldLabel']}
            hint={m['showcase.fieldHint']}
            error={m['showcase.fieldError']}
            inputProps={
              {
                name: 'name',
                autoComplete: 'name',
                'data-testid': 'invalid-field',
              } as React.InputHTMLAttributes<HTMLInputElement>
            }
          />
          <Field
            label={m['showcase.validField']}
            inputProps={{ name: 'display-name', autoComplete: 'nickname' }}
          />
          <Field
            label={m['showcase.disabledField']}
            inputProps={{ disabled: true }}
          />
        </form>
      </section>
      <section
        id="cards"
        aria-labelledby="cards-title"
        className={styles.section}
      >
        <h2 id="cards-title">{m['showcase.cards']}</h2>
        <div className={styles.grid}>
          <Card as="article">
            <h3>{m['showcase.cards']}</h3>
            <p>{m['showcase.cardBody']}</p>
          </Card>
          <Card as="article" elevated>
            <h3>{m['showcase.elevatedCard']}</h3>
            <p>{m['showcase.cardBody']}</p>
          </Card>
        </div>
      </section>
      <section
        id="dialog"
        aria-labelledby="dialog-title"
        className={styles.section}
      >
        <h2 id="dialog-title">{m['showcase.dialog']}</h2>
        <Button
          variant="destructive"
          data-testid="dialog-trigger"
          onClick={() => setOpen(true)}
        >
          {m['showcase.deleteSample']}
        </Button>
        <ConfirmDialog
          open={open}
          title={m['dialog.title']}
          description={m['dialog.description']}
          confirmLabel={m['dialog.confirm']}
          cancelLabel={m['dialog.cancel']}
          tone="destructive"
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </section>
      <section
        id="toast"
        aria-labelledby="toast-title"
        className={styles.section}
      >
        <h2 id="toast-title">{m['showcase.toast']}</h2>
        <Button
          data-testid="toast-trigger"
          onClick={() => toast.success(m['toast.success'])}
        >
          {m['showcase.showToast']}
        </Button>
      </section>
      <section
        id="alerts"
        aria-labelledby="alerts-title"
        className={styles.section}
      >
        <h2 id="alerts-title">{m['showcase.alerts']}</h2>
        <div className={styles.stack}>
          {(['success', 'warning', 'error', 'info'] as const).map((tone) => (
            <Alert
              key={tone}
              tone={tone}
              title={m[`showcase.${tone}`]}
              data-testid={`outside-${tone}`}
            />
          ))}
        </div>
      </section>
      <section
        id="states"
        aria-labelledby="states-title"
        className={styles.section}
      >
        <h2 id="states-title">{m['showcase.states']}</h2>
        <div className={styles.stack}>
          <div
            role="region"
            aria-busy="true"
            aria-label={m['showcase.skeleton']}
            className={styles.stack}
            data-testid="skeleton-demo"
          >
            <Skeleton shape="circle" />
            <Skeleton shape="text" lines={3} />
            <Skeleton shape="card" />
          </div>
          <EmptyState
            title={m['states.empty.title']}
            description={m['states.empty.description']}
          />
          <NoResults
            title={m['states.noResults.title']}
            description={m['states.noResults.description']}
          />
          <ErrorState
            title={m['states.error.title']}
            description={m['states.error.description']}
            retryLabel={m['states.retry']}
            onRetry={() => setRetries((v) => v + 1)}
          />
          <p>
            {m['showcase.retryCount']}:{' '}
            <Bidi>
              <span data-testid="retry-count">{retries}</span>
            </Bidi>
          </p>
        </div>
      </section>
    </>
  );
}
