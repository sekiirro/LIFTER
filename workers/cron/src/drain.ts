export type Job = {
  id: string;
  kind: string;
  workspace_id: string | null;
  payload: Record<string, unknown>;
  lease_token: string;
};

export type Handler = (job: {
  jobId: string;
  kind: string;
  workspaceId: string | null;
  payload: Record<string, unknown>;
  leaseToken: string;
}) => Promise<void>;

type RpcMethods = {
  jobs_claim: { args: { batch: number }; result: Job[] };
  jobs_complete: { args: { id: string; lease: string }; result: boolean };
  jobs_fail: {
    args: { id: string; lease: string; error_code: string; permanent: boolean };
    result: string | null;
  };
  handle_client_trainer_distribution: {
    args: { p_job_id: string; p_lease_token: string };
    result: boolean;
  };
  po_export_snapshot: {
    args: { p_job_id: string; p_lease_token: string };
    result: {
      rows: Array<{ row: Record<string, string | null> }>;
      row_count: number;
      exceeded_limit: boolean;
    };
  };
  po_export_finalize: {
    args: {
      p_job_id: string;
      p_lease_token: string;
      p_object_path: string;
      p_row_count: number;
    };
    result: boolean;
  };
  po_export_failed: {
    args: { p_job_id: string; p_lease_token: string };
    result: boolean;
  };
  po_export_expired_artifacts: {
    args: { p_limit: number };
    result: Array<{ job_id: string; object_path: string }>;
  };
  po_export_expired_mark: {
    args: { p_job_id: string };
    result: boolean;
  };
  handle_quality_monthly_reminder: {
    args: { p_job_id: string; p_lease_token: string };
    result: boolean;
  };
  alert_expired_refund_auth_lockouts: {
    args: { p_limit: number; p_checked_at: string };
    result: number;
  };
  claim_refund_auth_lockout_jobs: {
    args: { p_limit: number };
    result: Array<{
      id: string;
      auth_user_id: string;
      attempts: number;
      status: 'pending' | 'retry';
    }>;
  };
  complete_refund_auth_lockout_job: {
    args: { p_id: string; p_completed_at: string };
    result: boolean;
  };
  retry_refund_auth_lockout_job: {
    args: {
      p_id: string;
      p_attempt: number;
      p_retry_at: string;
      p_safe_error_code: 'provider_unavailable' | 'auth_admin_unavailable';
    };
    result: boolean;
  };
  claim_account_deletion_intents: {
    args: { p_limit: number };
    result: Array<{
      id: string;
      target_user_id: string;
      target_kind: 'client' | 'staff';
      state:
        | 'pending_ban'
        | 'banned_pending_db'
        | 'release_pending'
        | 'auth_release_in_progress'
        | 'completed';
      attempts: number;
      lease_token: string;
    }>;
  };
  advance_deletion_step_a: {
    args: { p_intent_id: string; p_lease_token: string };
    result: boolean;
  };
  execute_deletion_step_b: {
    args: { p_intent_id: string; p_lease_token: string };
    result: boolean;
  };
  begin_deletion_step_c: {
    args: { p_intent_id: string; p_lease_token: string };
    result: boolean;
  };
  execute_deletion_step_d: {
    args: { p_intent_id: string; p_lease_token: string };
    result: boolean;
  };
  retry_account_deletion_intent: {
    args: {
      p_intent_id: string;
      p_lease_token: string;
      p_attempt: number;
      p_retry_at: string;
      p_safe_error_code:
        | 'provider_unavailable'
        | 'auth_admin_unavailable'
        | 'metadata_not_empty'
        | 'step_b_failed'
        | 'step_d_failed';
    };
    result: boolean;
  };
};

export type Rpc = <Name extends keyof RpcMethods>(
  name: Name,
  args: RpcMethods[Name]['args'],
) => Promise<RpcMethods[Name]['result']>;

export class JobError extends Error {
  readonly code: string;
  readonly permanent: boolean;

  constructor(code: string, options: { permanent?: boolean } = {}) {
    // Invalid codes must never send arbitrary handler text into the database.
    const safeCode = /^[a-z0-9_.:-]{1,64}$/.test(code) ? code : 'handler_error';
    super(safeCode);
    this.code = safeCode;
    this.permanent = options.permanent ?? false;
  }
}

export async function drain({
  rpc,
  handlers,
  now = Date.now,
  budgetMs = 20_000,
  batch = 25,
}: {
  rpc: Rpc;
  handlers: Readonly<Record<string, Handler>>;
  now?: () => number;
  budgetMs?: number;
  batch?: number;
}): Promise<void> {
  const startedAt = now();
  while (now() - startedAt < budgetMs) {
    const jobs = await rpc('jobs_claim', { batch });
    if (jobs.length === 0) return;
    for (const job of jobs) {
      // Claimed but unstarted jobs recover through their database lease.
      if (now() - startedAt >= budgetMs) return;
      const handler = Object.hasOwn(handlers, job.kind)
        ? handlers[job.kind]
        : undefined;
      let failure: JobError | undefined;
      if (!handler) {
        failure = new JobError('unknown_kind', { permanent: true });
      } else {
        try {
          await handler({
            jobId: job.id,
            kind: job.kind,
            workspaceId: job.workspace_id,
            payload: job.payload,
            leaseToken: job.lease_token,
          });
        } catch (error) {
          failure =
            error instanceof JobError ? error : new JobError('handler_error');
        }
      }
      // RPC failures propagate; they are transport failures, not handler errors.
      if (failure) {
        await rpc('jobs_fail', {
          id: job.id,
          lease: job.lease_token,
          error_code: failure.code,
          permanent: failure.permanent,
        });
      } else {
        await rpc('jobs_complete', { id: job.id, lease: job.lease_token });
      }
    }
  }
}
