import { JobError, type Handler, type Rpc } from './drain';

export function createHandlers(rpc: Rpc): Readonly<Record<string, Handler>> {
  return {
    'system.noop': async () => {},
    'client.distribution': async ({ jobId, leaseToken }) => {
      const handled = await rpc('handle_client_trainer_distribution', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
      });
      if (!handled)
        throw new JobError('distribution_lease_invalid', { permanent: true });
    },
    'quality.monthly_reminder': async ({ jobId, leaseToken }) => {
      const handled = await rpc('handle_quality_monthly_reminder', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
      });
      if (!handled)
        throw new JobError('quality_reminder_lease_invalid', {
          permanent: true,
        });
    },
  };
}

/** The existing every-minute Worker schedule invokes this bounded DB evaluator. */
export function createSubscriptionExpiryHandler(rpc: Rpc): () => Promise<void> {
  return async () => {
    await rpc('run_subscription_expiry_notices', {});
  };
}
