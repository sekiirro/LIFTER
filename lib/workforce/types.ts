export type FormStatus =
  'Scheduled' | 'Awaiting Client' | 'Client Overdue' | 'Submitted';

export type FollowupStatus = 'Pending' | 'Followed Up' | 'Late' | 'Disputed';

export type TrainerCheckinRow = {
  client_id: string;
  assignment_id: string;
  client_name: string;
  phone_e164: string | null;
  username_normalized: string | null;
  telegram_username: string | null;
  responsible_trainer_id: string | null;
  scheduled_at: string;
  submitted_at: string | null;
  followup_due_at: string | null;
  form_status: FormStatus;
  followup_status: FollowupStatus;
  followup_actor_id: string | null;
  followup_at: string | null;
  answer_history: Array<{ answers: Record<string, unknown> }>;
  followup_history: Array<{
    status: FollowupStatus;
    actor_user_id: string | null;
    occurred_at: string;
  }>;
};

export type FormStatusFilter = 'all' | FormStatus;
export type FollowupStatusFilter = 'all' | FollowupStatus;
