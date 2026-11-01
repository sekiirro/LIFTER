'use client';

import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import { getMessages } from '../../lib/i18n';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type PlanProjection = {
  planId?: string;
  readiness?: string;
  publishedVersion?: number;
  currentRevisionId?: string;
};

function asMessages(props: Record<string, unknown>): Messages {
  if (props.messages) return props.messages as Messages;
  const locale = (props.locale as Locale | undefined) ?? 'en';
  return getMessages(locale);
}

function pickHandler(props: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const value = props[name];
    if (typeof value === 'function')
      return value as (...args: unknown[]) => void;
  }
  const handlers = props.handlers ?? props.actions ?? props.callbacks;
  if (handlers && typeof handlers === 'object') {
    for (const name of names) {
      const value = (handlers as Record<string, unknown>)[name];
      if (typeof value === 'function')
        return value as (...args: unknown[]) => void;
    }
  }
  return undefined;
}

export function PlanLifecycleControls(props: Record<string, unknown>) {
  const m = asMessages(props);
  const projection = (props.projection ??
    props.plan ??
    props.planProjection ??
    {}) as PlanProjection;
  const planId = (props.planId ??
    props.id ??
    projection.planId ??
    '') as string;

  const onAutosave = pickHandler(
    props,
    'onAutosave',
    'onAutoSave',
    'onAutosaved',
    'onChange',
  );
  const onSaveDraft = pickHandler(
    props,
    'onSaveDraft',
    'onSaveAsDraft',
    'onSaveAsDraftPlan',
  );
  const onPublish = pickHandler(
    props,
    'onPublish',
    'onReadyAndPublish',
    'onReadyPublish',
    'onReadyAndPublishPlan',
  );
  const onCreate = pickHandler(
    props,
    'onCreateNewPlan',
    'onCreatePlan',
    'onCreate',
    'onNewPlan',
  );

  const readiness = (props.readiness ??
    projection.readiness ??
    'draft') as string;
  const publishedVersion =
    props.publishedVersion ?? projection.publishedVersion;

  const controlled = props.value !== undefined;

  function handleAutosave(next: string) {
    onAutosave?.(next, planId);
  }

  return (
    <Card as="section" aria-labelledby="plan-lifecycle-title" dir={undefined}>
      <header>
        <h2 id="plan-lifecycle-title">{m['planCore.title']}</h2>
        {planId ? (
          <p>
            <span>{m['planCore.planId']}: </span>
            <Bidi dir="ltr">{planId}</Bidi>
          </p>
        ) : null}
        <p>{m['planCore.autosave']}</p>
        <p>{m['planCore.draftPrivate']}</p>
      </header>

      <label className="sr-only" htmlFor="plan-lifecycle-editor">
        {m['planCore.autosave']}
      </label>
      <textarea
        id="plan-lifecycle-editor"
        data-testid="plan-editor"
        data-autosave="true"
        defaultValue={
          controlled
            ? undefined
            : ((props.defaultValue ?? props.value ?? '') as string)
        }
        value={controlled ? (props.value as string) : undefined}
        onChange={(event) => handleAutosave(event.target.value)}
        aria-label={m['planCore.autosave']}
      />

      <div role="group" aria-label={m['planCore.title']}>
        <Button
          type="button"
          data-testid="save-draft"
          data-action="save-draft"
          onClick={() => onSaveDraft?.(planId)}
        >
          {m['planCore.saveDraft']}
        </Button>
        <Button
          type="button"
          data-testid="ready-publish"
          data-action="ready-publish"
          onClick={() => onPublish?.(planId)}
        >
          {m['planCore.readyPublish']}
        </Button>
        <Button
          type="button"
          data-testid="create-new-plan"
          data-action="create-new-plan"
          onClick={() => onCreate?.()}
        >
          {m['planCore.createNewPlan']}
        </Button>
      </div>

      <p data-testid="plan-readiness" data-readiness={readiness}>
        {m['planCore.readiness']}: {readiness}
      </p>
      {publishedVersion !== undefined && publishedVersion !== null ? (
        <p data-testid="plan-published-version">
          <Bidi dir="ltr">{String(publishedVersion)}</Bidi>
        </p>
      ) : null}
    </Card>
  );
}
