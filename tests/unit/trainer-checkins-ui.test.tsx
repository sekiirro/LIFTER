import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getMessages } from '../../lib/i18n';
import {
  TrainerCheckinsView,
  formatCairoDateTime,
  type TrainerCheckinsViewProps,
} from '../../components/workforce/TrainerCheckinsView';
import { ToastProvider } from '../../components/ui/Toast';
import type { TrainerCheckinRow } from '../../lib/workforce/types';
import TrainerCheckinsPage from '../../app/(app)/workforce/check-ins/page';
import TrainerCheckinsLoading from '../../app/(app)/workforce/check-ins/loading';

function renderView(props: TrainerCheckinsViewProps) {
  const messages = getMessages(props.locale);
  return renderToStaticMarkup(
    createElement(
      ToastProvider as unknown as (p: {
        dismissLabel: string;
        children?: unknown;
      }) => ReactElement,
      { dismissLabel: messages['toast.dismiss'] ?? 'Dismiss' },
      createElement(TrainerCheckinsView, props),
    ),
  );
}

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  cookies: vi.fn(),
  session: vi.fn(),
  readTrainerCheckins: vi.fn(),
  confirmTrainerFollowupAction: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));
vi.mock('../../lib/workforce/checkins', () => ({
  readTrainerCheckins: mocks.readTrainerCheckins,
}));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));

const sampleCheckins: TrainerCheckinRow[] = [
  {
    client_id: 'client-1',
    assignment_id: 'assignment-1',
    client_name: 'Ahmed Youssef',
    phone_e164: '+201001234567',
    username_normalized: 'ahmed.y',
    telegram_username: 'ahmed_telegram',
    responsible_trainer_id: 'trainer-1',
    scheduled_at: '2026-11-20T08:00:00Z',
    submitted_at: '2026-11-20T09:30:00Z',
    followup_due_at: '2026-11-21T09:30:00Z',
    form_status: 'Submitted',
    followup_status: 'Pending',
    followup_actor_id: null,
    followup_at: null,
    answer_history: [{ answers: { workoutAdherence: 8 } }],
    followup_history: [
      {
        status: 'Pending',
        actor_user_id: null,
        occurred_at: '2026-11-20T09:30:00Z',
      },
    ],
  },
  {
    client_id: 'client-2',
    assignment_id: 'assignment-2',
    client_name: 'Sara Karim',
    phone_e164: '+201007654321',
    username_normalized: 'sara.k',
    telegram_username: 'sara_telegram',
    responsible_trainer_id: 'trainer-1',
    scheduled_at: '2026-11-18T08:00:00Z',
    submitted_at: '2026-11-18T09:00:00Z',
    followup_due_at: '2026-11-19T09:00:00Z',
    form_status: 'Submitted',
    followup_status: 'Late',
    followup_actor_id: null,
    followup_at: null,
    answer_history: [{ answers: { dietAdherence: 7 } }],
    followup_history: [
      {
        status: 'Pending',
        actor_user_id: null,
        occurred_at: '2026-11-18T09:00:00Z',
      },
      {
        status: 'Late',
        actor_user_id: null,
        occurred_at: '2026-11-19T09:00:00Z',
      },
    ],
  },
  {
    client_id: 'client-3',
    assignment_id: 'assignment-3',
    client_name: 'Omar Tarek',
    phone_e164: '+201009998888',
    username_normalized: 'omar.t',
    telegram_username: null,
    responsible_trainer_id: 'trainer-2',
    scheduled_at: '2026-11-22T08:00:00Z',
    submitted_at: null,
    followup_due_at: null,
    form_status: 'Awaiting Client',
    followup_status: 'Pending',
    followup_actor_id: null,
    followup_at: null,
    answer_history: [],
    followup_history: [],
  },
];

describe('Trainer Check-ins UI (T006 / FR-004, FR-005, FR-017, FR-029)', () => {
  it.each([
    ['en', 'Weekly check-ins', 'Mark followed up', 'Actions'],
    ['ar', 'المتابعات الأسبوعية', 'سجّل إنك اتواصلت', 'الإجراءات'],
  ] as const)(
    'renders page title, fields, and action buttons in %s',
    (locale, expectedTitle, expectedBtn, expectedActions) => {
      const messages = getMessages(locale);
      const html = renderView({
        workspaceId: 'ws-1',
        locale,
        checkins: sampleCheckins,
        confirmFollowup: vi.fn(),
      });

      // Title
      expect(html).toContain(expectedTitle);

      // Table column headers
      expect(html).toContain(messages['registrationApproval.name']);
      expect(html).toContain(messages['clientSignup.phone']);
      expect(html).toContain(messages['workforce.checkin.column.platform']);
      expect(html).toContain(messages['clientSignup.telegramUsername']);
      expect(html).toContain(messages['workforce.checkin.column.formSchedule']);
      expect(html).toContain(messages['workforce.checkin.column.submittedAt']);
      expect(html).toContain(messages['workforce.checkin.filter.formStatus']);
      expect(html).toContain(messages['workforce.checkin.column.deadline']);
      expect(html).toContain(
        messages['workforce.checkin.filter.followUpStatus'],
      );
      expect(html).toContain(messages['workforce.checkin.column.followedUpAt']);
      expect(html).toContain(messages['staff.clientDirectory.assignment']);
      expect(html).toContain(messages['workforce.checkin.column.actions']);
      expect(html).toContain(expectedActions);

      // Client data rows
      expect(html).toContain('Ahmed Youssef');
      expect(html).toContain('+201001234567');
      expect(html).toContain('ahmed.y');
      expect(html).toContain('@ahmed_telegram');

      // Status badges
      expect(html).toContain(
        messages['workforce.checkin.formStatus.submitted'],
      );
      expect(html).toContain(
        messages['workforce.checkin.formStatus.awaitingClient'],
      );
      expect(html).toContain(
        messages['workforce.checkin.followStatus.pending'],
      );
      expect(html).toContain(messages['workforce.checkin.followStatus.late']);

      // Late warning for late item
      expect(html).toContain(
        messages['workforce.checkin.lateWarning'].replace(/"/g, '&quot;'),
      );

      // Follow-up action button
      expect(html).toContain(expectedBtn);
    },
  );

  it('renders permission-denied state with no existence disclosure', () => {
    const en = getMessages('en');
    const ar = getMessages('ar');

    const enHtml = renderView({
      workspaceId: 'ws-1',
      locale: 'en',
      checkins: [],
      denied: true,
      confirmFollowup: vi.fn(),
    });
    expect(enHtml).toContain(en['workforce.checkin.denied']);
    expect(enHtml).not.toContain('table');
    expect(enHtml).not.toContain('Ahmed Youssef');

    const arHtml = renderView({
      workspaceId: 'ws-1',
      locale: 'ar',
      checkins: [],
      denied: true,
      confirmFollowup: vi.fn(),
    });
    expect(arHtml).toContain(ar['workforce.checkin.denied']);
    expect(arHtml).not.toContain('table');
  });

  it('renders empty state when no check-ins exist', () => {
    const en = getMessages('en');
    const html = renderView({
      workspaceId: 'ws-1',
      locale: 'en',
      checkins: [],
      confirmFollowup: vi.fn(),
    });
    expect(html).toContain(en['workforce.checkin.empty']);
  });

  it('renders error state with retry button', () => {
    const en = getMessages('en');
    const html = renderView({
      workspaceId: 'ws-1',
      locale: 'en',
      checkins: [],
      error: true,
      confirmFollowup: vi.fn(),
    });
    expect(html).toContain(en['workforce.checkin.loadError']);
    expect(html).toContain(en['states.retry']);
  });

  it.each([
    ['en', 'Loading check-ins…'],
    ['ar', 'بنحمّل المتابعات…'],
  ] as const)(
    'renders the approved loading copy in %s',
    async (locale, expectedLoading) => {
      mocks.cookies.mockResolvedValue({ get: () => ({ value: locale }) });
      const messages = getMessages(locale);
      const html = renderToStaticMarkup(await TrainerCheckinsLoading());

      expect(html).toContain(expectedLoading);
      expect(html).toContain(messages['workforce.checkin.loading']);
      expect(html).toContain('data-testid="checkins-loading"');
    },
  );

  it('formats dates accurately in Africa/Cairo', () => {
    // 2026-11-20T08:00:00Z -> UTC+2 is 10:00
    const formattedEn = formatCairoDateTime('2026-11-20T08:00:00Z', 'en');
    expect(formattedEn).toContain('Nov');
    expect(formattedEn).toContain('20');
    expect(formattedEn).toContain('10:00');

    expect(formatCairoDateTime(null, 'en')).toBe('—');
    expect(formatCairoDateTime(undefined, 'en')).toBe('—');
  });

  describe('TrainerCheckinsPage server authorization', () => {
    it('denies Workspace Owner (WO) with no existence disclosure', async () => {
      mocks.actor.mockResolvedValue({
        role: 'workspace_owner',
        activeWorkspaceIds: ['ws-1'],
      });
      mocks.cookies.mockResolvedValue({
        get: () => ({ value: 'en' }),
      });

      const page = await TrainerCheckinsPage({
        searchParams: Promise.resolve({ workspace: 'ws-1' }),
      });
      const html = renderToStaticMarkup(page);

      const en = getMessages('en');
      expect(html).toContain(en['workforce.checkin.denied']);
      expect(html).not.toContain('trainer-checkins-table');
    });

    it('denies Sales with no existence disclosure', async () => {
      mocks.actor.mockResolvedValue({
        role: 'sales',
        activeWorkspaceIds: ['ws-1'],
      });
      mocks.cookies.mockResolvedValue({
        get: () => ({ value: 'en' }),
      });

      const page = await TrainerCheckinsPage({
        searchParams: Promise.resolve({ workspace: 'ws-1' }),
      });
      const html = renderToStaticMarkup(page);

      const en = getMessages('en');
      expect(html).toContain(en['workforce.checkin.denied']);
      expect(html).not.toContain('trainer-checkins-table');
    });

    it('allows Trainer and displays check-in queue', async () => {
      mocks.actor.mockResolvedValue({
        role: 'trainer',
        activeWorkspaceIds: ['ws-1'],
      });
      mocks.cookies.mockResolvedValue({
        get: () => ({ value: 'en' }),
      });
      mocks.session.mockResolvedValue({
        from: () => ({
          select: () => ({
            order: () => ({
              in: () =>
                Promise.resolve({
                  data: [{ id: 'ws-1', name: 'Alpha Gym' }],
                  error: null,
                }),
            }),
          }),
        }),
      });
      mocks.readTrainerCheckins.mockResolvedValue({
        status: 'ok',
        checkins: sampleCheckins,
      });

      const page = await TrainerCheckinsPage({
        searchParams: Promise.resolve({ workspace: 'ws-1' }),
      });
      const html = renderToStaticMarkup(page);

      expect(html).toContain('Weekly check-ins');
      expect(html).toContain('Ahmed Youssef');
      expect(html).toContain('Sara Karim');
    });
  });
});
