import type { Handler } from './drain';

export const handlers: Readonly<Record<string, Handler>> = {
  'system.noop': async () => {},
};
