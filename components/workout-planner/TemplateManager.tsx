import { useId } from 'react';
import { dirFor, type Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import {
  decideF17,
  type F17Actor,
  type F17Role,
} from '../../lib/workout-planner/authorization';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';
import styles from './TemplateManager.module.css';

export type TemplateScope = 'global' | 'own' | 'assigned';

export type TemplateSummary = {
  id: string;
  name: string;
  scope: TemplateScope;
  version: number;
  retired: boolean;
  /** Origin global template name. Rendered for the PO view only (FR-008/FR-012). */
  originName?: string;
  /** Origin global template version. Rendered for the PO view only (FR-008/FR-012). */
  originVersion?: number;
};

export type TemplateManagerProps = {
  locale: Locale;
  /** Drives PO-only global controls and provenance masking (no fetching). */
  role: F17Role;
  templates: TemplateSummary[];
  onLoad: (id: string) => void;
  onCreate: (scope: 'global' | 'workspace') => void;
  onEdit: (id: string) => void;
};

const SCOPES: TemplateScope[] = ['global', 'own', 'assigned'];

function scopeHeadingKey(scope: TemplateScope): string {
  if (scope === 'own') return 'templates.ownScope';
  if (scope === 'assigned') return 'templates.assignedScope';
  return 'templates.globalScope';
}

function actorFor(role: F17Role): F17Actor {
  return {
    role,
    workspaceRelation: 'own',
    coachingWork: true,
    membershipRevoked: false,
  };
}

function named(template: string, name: string): string {
  const parts = template.split('{name}');
  if (parts.length !== 2) return `${template}: ${name}`;
  return `${parts[0]}${name}${parts[1]}`;
}

/**
 * Template manager list, slice 1 (FR-008, FR-010, FR-011; SC-004):
 * global / own / assigned scopes, load + create/edit entry points.
 * PO-only global controls are gated by the role prop; assigned-copy
 * provenance is masked from non-PO roles. The PO assignment wizard
 * (Step 1/Step 2 + skip explanations) is slice 2 and is not built here.
 */
export function TemplateManager({
  locale,
  role,
  templates,
  onLoad,
  onCreate,
  onEdit,
}: TemplateManagerProps) {
  const m = getMessages(locale);
  const dir = dirFor(locale);
  const headingId = useId();
  const actor = actorFor(role);
  const canManageGlobal = decideF17(actor, 'global-template.manage').allowed;
  const canManageWorkspace = decideF17(
    actor,
    'workspace-template.manage',
  ).allowed;

  return (
    <section
      dir={dir}
      lang={locale}
      aria-labelledby={headingId}
      className={styles.panel}
      data-testid="workout-template-manager"
    >
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 id={headingId} className={styles.title}>
            {m['templates.listTitle']}
          </h2>
        </div>
        <div className={styles.actions}>
          {canManageWorkspace && (
            <Button variant="secondary" onClick={() => onCreate('workspace')}>
              {m['templates.createWorkspace']}
            </Button>
          )}
          {canManageGlobal && (
            <Button variant="primary" onClick={() => onCreate('global')}>
              {m['templates.createGlobal']}
            </Button>
          )}
        </div>
      </header>

      {templates.length === 0 ? (
        <EmptyState title={m['templates.empty']} />
      ) : (
        SCOPES.map((scope) => {
          const items = templates.filter((t) => t.scope === scope);
          const sectionId = `${headingId}-${scope}`;
          return (
            <section
              key={scope}
              aria-labelledby={sectionId}
              className={styles.scope}
              data-testid={`template-scope-${scope}`}
            >
              <h3 id={sectionId} className={styles.scopeTitle}>
                {m[scopeHeadingKey(scope) as keyof typeof m]}
              </h3>
              {items.length === 0 ? (
                <p className={styles.empty}>{m['templates.empty']}</p>
              ) : (
                <ul className={styles.list}>
                  {items.map((item) => {
                    const editable =
                      !item.retired &&
                      (item.scope === 'global'
                        ? canManageGlobal
                        : canManageWorkspace);
                    return (
                      <li key={item.id} className={styles.card}>
                        <div className={styles.cardHead}>
                          <span className={styles.name}>{item.name}</span>
                          <span
                            className={`${styles.badge} ${item.retired ? styles.badgeMuted : styles.badgeActive}`}
                          >
                            {item.retired
                              ? m['templates.retired']
                              : m['templates.active']}
                          </span>
                        </div>
                        <p className={styles.meta}>
                          {m['templates.version']}{' '}
                          <Bidi dir="ltr">{item.version}</Bidi>
                        </p>
                        {item.scope === 'assigned' &&
                          canManageGlobal &&
                          item.originName !== undefined &&
                          item.originVersion !== undefined && (
                            <p
                              className={styles.origin}
                              data-testid="template-origin"
                            >
                              <Bidi dir="ltr">
                                {item.originName} · {item.originVersion}
                              </Bidi>
                            </p>
                          )}
                        {(!item.retired || editable) && (
                          <div className={styles.cardActions}>
                            {!item.retired && (
                              <Button
                                variant="secondary"
                                aria-label={named(
                                  m['templates.loadNamed'],
                                  item.name,
                                )}
                                onClick={() => onLoad(item.id)}
                              >
                                {m['templates.load']}
                              </Button>
                            )}
                            {editable && (
                              <Button
                                variant="secondary"
                                aria-label={named(
                                  m['templates.editNamed'],
                                  item.name,
                                )}
                                onClick={() => onEdit(item.id)}
                              >
                                {m['templates.edit']}
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
        })
      )}
    </section>
  );
}
