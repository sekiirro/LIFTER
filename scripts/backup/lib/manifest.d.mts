export interface Manifest {
  format: number;
  id: string;
  created_at: string;
  cli: string;
  files: Record<string, string>;
}
export const FILES: string[];
export const CLI_VERSION: string;
export function sha256(path: string): Promise<string>;
export function buildManifest(
  folder: string,
  id: string,
  createdAt: string,
): Promise<Manifest>;
export function verifyManifest(folder: string): Promise<Manifest>;
