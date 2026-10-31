import { drain } from './drain';
import { handlers } from './handlers';
import { createRpc, type Env } from './rpc';
import { createBrandingGc, runBrandingGc } from './branding-gc';
import type { ExecutionContext, ScheduledController } from './types';

const worker = {
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(drain({ rpc: createRpc(env), handlers }));
    ctx.waitUntil(runBrandingGc(createBrandingGc(env)));
  },
};

export default worker;
