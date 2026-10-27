import type { Readable } from 'node:stream';
import type { EventEmitter } from 'node:events';
export class CommandError extends Error {
  constructor(stderr?: string);
  stderr: string;
}
export function npxCommand(args: string[]): Promise<[string, string[]]>;
export class TimeoutError extends CommandError {
  code: 'TIMEOUT';
}
export class InterruptedError extends CommandError {
  code: 'INTERRUPTED';
}
export function watchInterruptions(
  terminate: () => Promise<unknown>,
  options?: { signals?: EventEmitter; stderr?: () => string },
): {
  promise: Promise<never>;
  readonly error: InterruptedError | undefined;
  dispose(): void;
};
export interface RunOptions {
  timeoutMs?: number;
  output?: (stream: Readable) => Promise<unknown>;
  input?: Readable;
}
export function run(
  command: string,
  args: string[],
  options?: RunOptions,
): Promise<string>;
export function supabase(args: string[], options?: RunOptions): Promise<string>;
export function docker(args: string[], options?: RunOptions): Promise<string>;
