import { drain } from './drain';
import { handlers } from './handlers';
import { createRpc, type Env } from './rpc';
import { drainRefundAuthLockouts } from './refund-auth-lockout';
import type { ExecutionContext, ScheduledController } from './types';

const worker = {
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      Promise.all([
        drain({ rpc: createRpc(env), handlers }),
        drainRefundAuthLockouts(env),
      ]),
    );
  },
};

export default worker;
