import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  OptOutForm,
  optOutFailed,
  usernameErrorMessage,
  usernameNotice,
  type UsernameFormMessages,
} from '../../app/(client)/account/settings/LeaderboardSettingsForms';
import {
  ApproveForm,
  GenerateForm,
  decisionNotice,
  generateNotice,
} from '../../app/(app)/workspace-leaderboard/review/ApproveForm';
import { LeaderboardList } from '../../components/leaderboard/LeaderboardList';
import { getMessages } from '../../lib/i18n';
import { formatResultsMonth } from '../../lib/leaderboard/format';

describe('T029/T030 leaderboard list rendering', () => {
  it('renders the approved results month, rank labels and usernames only (EN)', () => {
    const messages = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(LeaderboardList, {
        periodMonth: '2026-10-01',
        entries: [
          { rank: 1, username: 'heba.sami' },
          { rank: 2, username: 'omar_9' },
        ],
        locale: 'en',
        messages,
      }),
    );
    expect(html).toContain('Results for October 2026');
    expect(html).toContain('Rank 1');
    expect(html).toContain('Rank 2');
    expect(html).toContain('<bdi dir="ltr">heba.sami</bdi>');
    expect(html).toContain('2 clients qualify so far.');
    expect(html).not.toMatch(/score|adherence|progress/iu);
  });

  it('uses Egyptian Arabic copy with Arabic digits and keeps usernames LTR', () => {
    const messages = getMessages('ar');
    const html = renderToStaticMarkup(
      createElement(LeaderboardList, {
        periodMonth: '2026-11-01',
        entries: [1, 2, 3, 4, 5].map((rank) => ({
          rank,
          username: `user_${rank}`,
        })),
        locale: 'ar',
        messages,
      }),
    );
    expect(html).toContain('المركز ١');
    expect(html).toContain('نتائج');
    expect(html).toContain('٢٠٢٦');
    expect(html).not.toContain('لحد دلوقتي');
    expect(html).toContain('<bdi dir="ltr">user_5</bdi>');
  });

  it('labels the month of the approved result, not the current month', () => {
    expect(
      formatResultsMonth('2026-09-01', 'Results for {month} {year}', 'en'),
    ).toBe('Results for September 2026');
    expect(() =>
      formatResultsMonth('2026-09-15', 'Results for {month} {year}', 'en'),
    ).toThrow(RangeError);
  });
});

describe('T011/T015 account-settings controls', () => {
  const m = getMessages('en');
  const usernameMessages: UsernameFormMessages = {
    label: m['clientSignup.username'],
    save: m['clientNotes.saveChanges'],
    saved: m['clientNotes.editedToast'],
    failed: m['states.error.description'],
    tooShort: m['accountSettings.username.tooShort'],
    tooLong: m['accountSettings.username.tooLong'],
    invalidChars: m['accountSettings.username.invalidChars'],
    reserved: m['accountSettings.username.reserved'],
    workspaceTaken: m['accountSettings.username.workspaceTaken'],
  };

  it('maps every username edit failure to its approved account-settings message', () => {
    expect(usernameErrorMessage('too_short', usernameMessages)).toBe(
      'Username must be at least 3 characters.',
    );
    expect(usernameErrorMessage('too_long', usernameMessages)).toBe(
      'Username must be at most 20 characters.',
    );
    expect(usernameErrorMessage('invalid_chars', usernameMessages)).toBe(
      'Username can contain only English letters, digits, underscores and dots.',
    );
    expect(usernameErrorMessage('reserved', usernameMessages)).toBe(
      'This username is reserved.',
    );
    expect(usernameErrorMessage('taken', usernameMessages)).toBe(
      'This username is already used in your workspace.',
    );
    expect(usernameErrorMessage('updated', usernameMessages)).toBeUndefined();
  });

  it('renders the direct opt-out control with the approved label', () => {
    const html = renderToStaticMarkup(
      createElement(OptOutForm, {
        action: async () => ({ status: 'opted_out' as const }),
        label: m['leaderboard.optOut.turnOffParticipation'],
        optedOut: false,
        successMessage: m['leaderboard.optOut.success'],
        optedOutMessage: m['leaderboard.optedOut'],
        failedMessage: m['states.error.description'],
      }),
    );
    expect(html).toContain('Turn off leaderboard participation');
    expect(html).toContain('type="submit"');
  });

  it('shows the approved opted-out state instead of the control once opted out', () => {
    const html = renderToStaticMarkup(
      createElement(OptOutForm, {
        action: async () => ({ status: 'idle' as const }),
        label: m['leaderboard.optOut.turnOffParticipation'],
        optedOut: true,
        successMessage: m['leaderboard.optOut.success'],
        optedOutMessage: m['leaderboard.optedOut'],
        failedMessage: m['states.error.description'],
      }),
    );
    expect(html).toContain('You turned off leaderboard participation.');
    expect(html).not.toContain('type="submit"');
  });

  it('confirms a saved username and surfaces a non-field failure', () => {
    expect(usernameNotice('updated', usernameMessages)).toEqual({
      tone: 'success',
      title: 'Changes saved',
    });
    expect(usernameNotice('unchanged', usernameMessages)?.tone).toBe('success');
    for (const status of ['unavailable', 'not_permitted'] as const)
      expect(usernameNotice(status, usernameMessages)).toEqual({
        tone: 'error',
        title: 'Something went wrong. Please try again.',
      });
    for (const status of ['idle', 'too_short', 'taken'] as const)
      expect(usernameNotice(status, usernameMessages)).toBeNull();
  });

  it('reports an opt-out failure instead of failing silently', () => {
    expect(optOutFailed('unavailable')).toBe(true);
    expect(optOutFailed('not_permitted')).toBe(true);
    expect(optOutFailed('opted_out')).toBe(false);
    expect(optOutFailed('idle')).toBe(false);
  });
});

describe('T026 PO review decision feedback', () => {
  const m = getMessages('en');
  const messages = {
    approved: m['leaderboard.publish.approved'],
    rejected: m['leaderboard.publish.rejected'],
    failed: m['states.error.description'],
  };

  it('claims an outcome only when the requested decision is recorded', () => {
    expect(decisionNotice('approved', 'approve', messages)).toEqual({
      tone: 'success',
      title: 'Monthly leaderboard approved.',
      done: true,
    });
    expect(decisionNotice('rejected', 'reject', messages)).toEqual({
      tone: 'success',
      title: 'Monthly leaderboard rejected.',
      done: true,
    });
    // A replay of the same decision reports that decision.
    expect(decisionNotice('already_decided', 'approve', messages)?.title).toBe(
      'Monthly leaderboard approved.',
    );
    expect(decisionNotice('already_decided', 'reject', messages)?.title).toBe(
      'Monthly leaderboard rejected.',
    );
    for (const status of [
      'conflict',
      'not_found',
      'invalid_input',
      'not_permitted',
      'unavailable',
    ] as const)
      expect(decisionNotice(status, 'approve', messages)).toEqual({
        tone: 'error',
        title: 'Something went wrong. Please try again.',
        done: false,
      });
    expect(decisionNotice('idle', 'approve', messages)).toBeNull();
  });

  it('renders approve and reject controls, both submitting their own decision', () => {
    for (const locale of ['en', 'ar'] as const) {
      const copy = getMessages(locale);
      const html = renderToStaticMarkup(
        createElement(
          ApproveForm,
          {
            action: async () => ({
              status: 'idle' as const,
              decision: 'approve' as const,
            }),
            publicationId: '11111111-1111-4111-8111-111111111111',
            empty: createElement('p', null, 'EMPTY'),
            label: copy['leaderboard.publish.action'],
            rejectLabel: copy['leaderboard.publish.rejectAction'],
            approvedMessage: copy['leaderboard.publish.approved'],
            rejectedMessage: copy['leaderboard.publish.rejected'],
            failedMessage: copy['states.error.description'],
          },
          createElement('ol', null, 'LIST'),
        ),
      );
      expect(html).toContain(copy['leaderboard.publish.action']);
      expect(html).toContain(copy['leaderboard.publish.rejectAction']);
      expect(html.match(/type="submit"/gu)).toHaveLength(2);
      for (const decision of ['approve', 'reject'])
        expect(
          html
            .match(/<button [^>]*>/gu)
            ?.some(
              (button) =>
                button.includes('name="decision"') &&
                button.includes(`value="${decision}"`),
            ),
          decision,
        ).toBe(true);
      expect(html).toContain('LIST');
      expect(html).not.toContain('EMPTY');
    }
  });

  it('shows the empty state and no control when nothing is pending', () => {
    const copy = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(ApproveForm, {
        action: async () => ({
          status: 'idle' as const,
          decision: 'approve' as const,
        }),
        publicationId: null,
        empty: createElement('p', null, 'EMPTY'),
        label: copy['leaderboard.publish.action'],
        rejectLabel: copy['leaderboard.publish.rejectAction'],
        approvedMessage: copy['leaderboard.publish.approved'],
        rejectedMessage: copy['leaderboard.publish.rejected'],
        failedMessage: copy['states.error.description'],
      }),
    );
    expect(html).toContain('EMPTY');
    expect(html).not.toContain('type="submit"');
  });

  it('maps generation results to the proposed copy, never claiming success on failure', () => {
    const copy = getMessages('en');
    const messages = {
      generated: copy['leaderboard.publish.generated'],
      pendingExists: copy['leaderboard.publish.pendingExists'],
      noEligible: copy['leaderboard.publish.noEligible'],
      failed: copy['states.error.description'],
    };
    expect(generateNotice('idle', messages)).toBeNull();
    for (const status of ['created', 'replayed'] as const)
      expect(generateNotice(status, messages)).toEqual({
        tone: 'success',
        title: 'The monthly leaderboard is ready for review.',
      });
    expect(generateNotice('pending_exists', messages)?.title).toBe(
      'A monthly leaderboard is already waiting for review.',
    );
    expect(generateNotice('no_eligible_clients', messages)?.title).toBe(
      'No clients qualify yet.',
    );
    for (const status of [
      'inputs_unresolved',
      'ineligible_client',
      'invalid_input',
      'not_permitted',
      'unavailable',
    ] as const)
      expect(generateNotice(status, messages)).toEqual({
        tone: 'error',
        title: 'Something went wrong. Please try again.',
      });
  });

  it('shows the generate control only when nothing is pending', () => {
    const copy = getMessages('ar');
    const props = {
      action: async () => ({ status: 'idle' as const }),
      workspaceId: '11111111-1111-4111-8111-111111111111',
      label: copy['leaderboard.publish.generateAction'],
      messages: {
        generated: copy['leaderboard.publish.generated'],
        pendingExists: copy['leaderboard.publish.pendingExists'],
        noEligible: copy['leaderboard.publish.noEligible'],
        failed: copy['states.error.description'],
      },
    };
    const idle = renderToStaticMarkup(
      createElement(GenerateForm, { ...props, hasPending: false }),
    );
    expect(idle).toContain(copy['leaderboard.publish.generateAction']);
    expect(idle).toContain('name="workspaceId"');
    expect(
      renderToStaticMarkup(
        createElement(GenerateForm, { ...props, hasPending: true }),
      ),
    ).toBe('');
  });
});

describe('T029 unavailable state', () => {
  it('renders the existing approved generic error state with a retry, never a payload', async () => {
    const { LeaderboardError } =
      await import('../../components/leaderboard/LeaderboardError');
    const html = renderToStaticMarkup(
      createElement(LeaderboardError, { reset: () => {} }),
    );
    const ar = getMessages('ar');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('role="alert"');
    expect(html).toContain(ar['states.error.title']);
    expect(html).toContain(ar['states.error.description']);
    expect(html).toContain(ar['states.retry']);
  });
});

describe('T030 mobile layout guard (no horizontal overflow at 390px)', () => {
  it('lets leaderboard content shrink below its longest item', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(
      resolve(process.cwd(), 'components/leaderboard/leaderboard.module.css'),
      'utf8',
    );
    const rule = (selector: string) =>
      css.slice(
        css.indexOf(`${selector} {`),
        css.indexOf('}', css.indexOf(`${selector} {`)),
      );
    expect(rule('.main')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(rule('.form')).toContain('min-inline-size: 0');
    expect(rule('.picker select')).toContain('max-inline-size: 100%');
  });

  it('renders the workspace picker as a design-system field', async () => {
    const { WorkspacePicker } =
      await import('../../app/(app)/workspace-leaderboard/WorkspacePicker');
    const html = renderToStaticMarkup(
      createElement(WorkspacePicker, {
        workspaces: [
          { id: 'a', name: 'A very long synthetic workspace name '.repeat(4) },
          { id: 'b', name: 'B' },
        ],
        selectedId: 'a',
        label: 'Workspace',
        submitLabel: 'Select',
      }),
    );
    expect(html).toMatch(/<div class="[^"]*picker[^"]*">/u);
    expect(html).toMatch(/<select[^>]*class="[^"]*input[^"]*"/u);
  });
});
