import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  OptOutForm,
  usernameErrorMessage,
  type UsernameFormMessages,
} from '../../app/(client)/account/settings/LeaderboardSettingsForms';
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
        successMessage: m['leaderboard.optOut.success'],
      }),
    );
    expect(html).toContain('Turn off leaderboard participation');
    expect(html).toContain('type="submit"');
  });
});
