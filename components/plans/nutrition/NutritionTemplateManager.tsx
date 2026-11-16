'use client';

import { useId } from 'react';
import { dirFor, type Locale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { Bidi } from '../../ui/Bidi';
import { Button } from '../../ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../ui/States';
import styles from './NutritionTemplateManager.module.css';

export type NutritionTemplateScope = 'global' | 'workspace';

/**
 * Actor roles from the F18 authorization matrix
 * (`specs/018-nutrition-planner/contracts/nutrition-api.md` §2): PO manages
 * globals and assigns; WO/Trainer with current `coaching_work` manage their
 * own workspace templates; Sales, clients and anyone else have no template
 * right. The parent owns workspace scoping and `coaching_work` checks; this
 * component only gates what it renders.
 */
export type NutritionTemplateRole =
  'PO' | 'WO' | 'Trainer' | 'Sales' | 'client' | 'unaffiliated';

export type NutritionTemplateStatus = 'ready' | 'loading' | 'error';

/**
 * List row shape from the F18 template RPCs
 * (`nutrition-api.md` §1, `template-assignment.md` §1): platform-scope global
 * identities and tenant-scope workspace identities with immutable versions and
 * a non-destructive retire marker. Workspace copies of a global template carry
 * the origin identity/version for the PO view only.
 */
export type NutritionTemplateSummary = {
  id: string;
  name: string;
  scope: NutritionTemplateScope;
  version: number;
  retired: boolean;
  /** Origin global template name. Rendered for the PO view only (FR-008/FR-009). */
  originName?: string;
  /** Origin global template version. Rendered for the PO view only. */
  originVersion?: number;
};

export type NutritionTemplateManagerProps = {
  locale: Locale;
  /** Drives PO-only global controls and provenance masking (no fetching). */
  role: NutritionTemplateRole;
  status: NutritionTemplateStatus;
  templates: NutritionTemplateSummary[];
  onRetry: () => void;
  onLoadVersion: (id: string) => void;
  onCreateVersion: (id: string) => void;
  onRetire: (id: string) => void;
  onMakeGlobal: (id: string) => void;
  onCreate: (scope: 'global' | 'workspace') => void;
};

const SCOPES: NutritionTemplateScope[] = ['global', 'workspace'];

function scopeHeadingKey(scope: NutritionTemplateScope): string {
  return scope === 'workspace'
    ? 'nutritionTemplates.workspace'
    : 'nutritionTemplates.global';
}

/**
 * Nutrition template manager, T025 slice 2 (FR-007, FR-009, FR-017):
 * global / workspace scopes, load-version/create-version/retire/make-global
 * entry points. PO-only global controls are gated by the role prop and the
 * global section is hidden from non-PO roles (no global read,
 * `nutrition-api.md` §2); assigned-copy provenance is masked from non-PO
 * roles. Retired templates are never loadable. Client-only: props/callbacks
 * in, no fetching, no server actions, no DB access.
 */
export function NutritionTemplateManager({
  locale,
  role,
  status,
  templates,
  onRetry,
  onLoadVersion,
  onCreateVersion,
  onRetire,
  onMakeGlobal,
  onCreate,
}: NutritionTemplateManagerProps) {
  const m = getMessages(locale);
  const dir = dirFor(locale);
  const headingId = useId();
  const hasAccess = role === 'PO' || role === 'WO' || role === 'Trainer';
  const canManageGlobal = role === 'PO';

  return (
    <section
      dir={dir}
      lang={locale}
      aria-labelledby={headingId}
      className={styles.panel}
      data-testid="nutrition-template-manager"
    >
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 id={headingId} className={styles.title}>
            {m['nutritionTemplates.title']}
          </h2>
          <p className={styles.intro}>{m['nutritionTemplates.intro']}</p>
        </div>
        {hasAccess && status === 'ready' && (
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => onCreate('workspace')}>
              {m['nutritionTemplates.create']}
            </Button>
            {canManageGlobal && (
              <Button variant="primary" onClick={() => onCreate('global')}>
                {m['nutritionTemplates.createGlobal']}
              </Button>
            )}
          </div>
        )}
      </header>

      {status === 'loading' && (
        <div role="status" className={styles.scope}>
          <p className={styles.empty}>{m['nutritionTemplates.loading']}</p>
          <Skeleton shape="card" />
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          title={m['nutritionTemplates.errorTitle']}
          description={m['nutritionTemplates.errorDescription']}
          onRetry={onRetry}
          retryLabel={m['nutritionTemplates.retry']}
        />
      )}

      {status === 'ready' && !hasAccess && (
        <p className={styles.empty}>{m['nutritionTemplates.noAccess']}</p>
      )}

      {status === 'ready' && hasAccess && templates.length === 0 && (
        <EmptyState title={m['nutritionTemplates.empty']} />
      )}

      {status === 'ready' &&
        hasAccess &&
        templates.length > 0 &&
        SCOPES.filter((scope) => scope !== 'global' || canManageGlobal).map(
          (scope) => {
            const items = templates.filter((t) => t.scope === scope);
            const sectionId = `${headingId}-${scope}`;
            return (
              <section
                key={scope}
                aria-labelledby={sectionId}
                className={styles.scope}
                data-testid={`nutrition-template-scope-${scope}`}
              >
                <h3 id={sectionId} className={styles.scopeTitle}>
                  {m[scopeHeadingKey(scope) as keyof typeof m]}
                </h3>
                {items.length === 0 ? (
                  <p className={styles.empty}>
                    {m['nutritionTemplates.empty']}
                  </p>
                ) : (
                  <ul className={styles.list}>
                    {items.map((item) => {
                      const editable =
                        !item.retired &&
                        (item.scope === 'global' ? canManageGlobal : hasAccess);
                      return (
                        <li key={item.id} className={styles.card}>
                          <div className={styles.cardHead}>
                            <span className={styles.name}>{item.name}</span>
                            <span
                              className={`${styles.badge} ${item.retired ? styles.badgeMuted : styles.badgeActive}`}
                            >
                              {item.retired
                                ? m['nutritionTemplates.retired']
                                : m['templates.active']}
                            </span>
                          </div>
                          <p className={styles.meta}>
                            {m['nutritionTemplates.version']}{' '}
                            <Bidi dir="ltr">{item.version}</Bidi>
                          </p>
                          {item.scope === 'workspace' &&
                            canManageGlobal &&
                            item.originName !== undefined &&
                            item.originVersion !== undefined && (
                              <p
                                className={styles.origin}
                                data-testid="nutrition-template-origin"
                              >
                                <Bidi dir="ltr">
                                  {item.originName} · {item.originVersion}
                                </Bidi>
                              </p>
                            )}
                          {editable && (
                            <div className={styles.cardActions}>
                              <Button
                                variant="secondary"
                                onClick={() => onLoadVersion(item.id)}
                              >
                                {m['nutritionTemplates.loadVersion']}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => onCreateVersion(item.id)}
                              >
                                {m['nutritionTemplates.createVersion']}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => onRetire(item.id)}
                              >
                                {m['nutritionTemplates.retire']}
                              </Button>
                              {item.scope === 'workspace' &&
                                canManageGlobal && (
                                  <Button
                                    variant="secondary"
                                    onClick={() => onMakeGlobal(item.id)}
                                  >
                                    {m['nutritionTemplates.makeGlobal']}
                                  </Button>
                                )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          },
        )}
    </section>
  );
}
