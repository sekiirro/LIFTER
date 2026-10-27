import type { Readable } from 'node:stream';
export class CommandError extends Error {
  constructor(stderr?: string);
  stderr: string;
}
export function npxCommand(args: string[]): Promise<[string, string[]]>;
export interface RunOptions {
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
