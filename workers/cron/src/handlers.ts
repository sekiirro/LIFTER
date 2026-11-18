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
  };
}
