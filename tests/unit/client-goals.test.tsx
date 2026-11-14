import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ClientGoals,
  goalNotice,
  type ClientGoalsMessages,
} from '../../components/client-goals/ClientGoals';
import { getMessages } from '../../lib/i18n';
import {
  NEAR_TERM_GOAL_MAX_LENGTH,
  extractNearTermGoal,
  parseClientGoalRead,
  parseGoalTypeUpdate,
} from '../../lib/leaderboard/client-goal-view';

// PO 2026-11-14: Goals section under Client Details. Synthetic values only.
const assignment = '55555555-5555-4555-8555-555555555555';

function messagesFor(locale: 'en' | 'ar'): ClientGoalsMessages {
  const m = getMessages(locale);
  return {
    title: m['clientGoals.title'],
    goalType: m['clientGoals.goalType'],
    goalTypes: {
      fat_loss: m['clientGoals.goalType.fatLoss'],
      muscle_gain: m['clientGoals.goalType.muscleGain'],
      maintenance: m['clientGoals.goalType.maintenance'],
    },
    notSet: m['clientGoals.notSet'],
    nearTermGoal: m['clientGoals.nearTermGoal'],
    nearTermGoalEmpty: m['clientGoals.nearTermGoalEmpty'],
    save: m['clientGoals.save'],
    saved: m['clientGoals.saved'],
    failed: m['states.error.description'],
  };
}

describe('goal read projection', () => {
  it('accepts only the documented shape', () => {
    expect(
      parseClientGoalRead({
        status: 'ok',
        goal_type: 'muscle_gain',
        reference_assignment_id: assignment,
      }),
    ).toEqual({
      status: 'ok',
      goalType: 'muscle_gain',
      referenceAssignmentId: assignment,
    });
    expect(
      parseClientGoalRead({
        status: 'ok',
        goal_type: null,
        reference_assignment_id: null,
      }),
    ).toMatchObject({ goalType: null, referenceAssignmentId: null });
    expect(parseClientGoalRead({ status: 'not_permitted' })).toEqual({
      status: 'not_permitted',
    });
    for (const bad of [
      null,
      [],
      { status: 'ok', goal_type: 'bulk', reference_assignment_id: null },
      { status: 'ok', goal_type: null, reference_assignment_id: 'x' },
      { status: 'weird' },
    ])
      expect(parseClientGoalRead(bad)).toEqual({ status: 'unavailable' });
  });

  it('keeps only the T01 string from the F15 answer payload, trimmed and capped', () => {
    expect(
      extractNearTermGoal({ T01: '  Run 5 km  ', B04: 82, N10: 'after' }),
    ).toBe('Run 5 km');
    expect(extractNearTermGoal({ T01: '   ' })).toBeNull();
    expect(extractNearTermGoal({ T01: 42 })).toBeNull();
    expect(extractNearTermGoal({ B04: 82 })).toBeNull();
    expect(extractNearTermGoal(null)).toBeNull();
    expect(
      Array.from(extractNearTermGoal({ T01: 'ي'.repeat(400) })!),
    ).toHaveLength(NEAR_TERM_GOAL_MAX_LENGTH);
  });

  it('maps only known update statuses', () => {
    for (const status of [
      'updated',
      'unchanged',
      'invalid_input',
      'not_found',
      'not_permitted',
    ])
      expect(parseGoalTypeUpdate({ status })).toBe(status);
    expect(parseGoalTypeUpdate({ status: 'other' })).toBe('unavailable');
    expect(parseGoalTypeUpdate(null)).toBe('unavailable');
  });
});

describe('Goals section rendering', () => {
  const action = async () => ({ status: 'idle' as const });

  it('offers the three goal types with a not-set placeholder when unset (EN)', () => {
    const html = renderToStaticMarkup(
      createElement(ClientGoals, {
        action,
        workspaceId: assignment,
        clientId: assignment,
        goalType: null,
        nearTermGoal: { status: 'empty' },
        messages: messagesFor('en'),
      }),
    );
    for (const text of [
      'Goals',
      'Goal Type',
      'Fat Loss',
      'Muscle Gain',
      'Maintenance',
      'Not set',
      'Near-term goal',
      'No answer yet.',
      'Save goal type',
    ])
      expect(html).toContain(text);
    expect(html.match(/<option/gu)).toHaveLength(4);
    expect(html).toContain('value="fat_loss"');
    expect(html).toContain('value="muscle_gain"');
    expect(html).toContain('value="maintenance"');
  });

  it('selects the saved goal type and shows the answer as bidi-isolated text (AR)', () => {
    const html = renderToStaticMarkup(
      createElement(ClientGoals, {
        action,
        workspaceId: assignment,
        clientId: assignment,
        goalType: 'maintenance',
        nearTermGoal: { status: 'answered', text: 'أخس 5 كيلو' },
        messages: messagesFor('ar'),
      }),
    );
    expect(html.match(/<option/gu)).toHaveLength(3);
    expect(html).not.toContain(messagesFor('ar').notSet);
    expect(html).toMatch(/<option value="maintenance" selected="">/u);
    expect(html).toContain('<bdi dir="auto">أخس 5 كيلو</bdi>');
  });

  it('shows the generic error when the reference answer cannot be read', () => {
    const html = renderToStaticMarkup(
      createElement(ClientGoals, {
        action,
        workspaceId: assignment,
        clientId: assignment,
        goalType: 'fat_loss',
        nearTermGoal: { status: 'unavailable' },
        messages: messagesFor('en'),
      }),
    );
    expect(html).toContain('Something went wrong. Please try again.');
  });

  it('confirms a save and reports every failure', () => {
    const m = messagesFor('en');
    expect(goalNotice('idle', m)).toBeNull();
    expect(goalNotice('updated', m)).toEqual({
      tone: 'success',
      title: 'Goal type saved.',
    });
    expect(goalNotice('unchanged', m)?.tone).toBe('success');
    for (const status of [
      'invalid_input',
      'not_found',
      'not_permitted',
      'unavailable',
    ] as const)
      expect(goalNotice(status, m)?.tone).toBe('error');
  });
});
