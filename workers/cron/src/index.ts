import { drain } from './drain';
import { createHandlers } from './handlers';
import { createRpc, type Env } from './rpc';
import { drainRefundAuthLockouts } from './refund-auth-lockout';
import { drainAccountDeletions } from './account-deletion';
import { purgeExpiredPoExports } from './po-export-expiry';
import { createBrandingGc, runBrandingGc } from './branding-gc';
import type { ExecutionContext, ScheduledController } from './types';

type ScheduledJob = {
  name: string;
  run: () => Promise<unknown>;
};

export async function runScheduledJobs(
  jobs: readonly ScheduledJob[],
  logError: (event: string, jobName: string) => void = (event, jobName) =>
    console.error(event, jobName),
): Promise<void> {
  const results = await Promise.allSettled(
    jobs.map(({ run }) => Promise.resolve().then(run)),
  );
  let failed = false;
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      failed = true;
      logError('scheduled_job_failed', jobs[index]!.name);
    }
  });
  if (failed) throw new Error('scheduled_jobs_failed');
}

const worker = {
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runScheduledJobs([
        {
          name: 'jobs',
          run: async () => {
            const rpc = createRpc(env);
            await drain({ rpc, handlers: createHandlers(rpc, env) });
          },
        },
        {
          name: 'branding_gc',
          run: () => runBrandingGc(createBrandingGc(env)),
        },
        {
          name: 'refund_auth_lockouts',
          run: async () => {
            const result = await drainRefundAuthLockouts(env);
            if (result.alertSweepError) console.error(result.alertSweepError);
          },
        },
        {
          name: 'account_deletions',
          run: () => drainAccountDeletions(env),
        },
        {
          name: 'po_export_expiry',
          run: () => purgeExpiredPoExports(env),
        },
      ]),
    );
  },
};

export default worker;
