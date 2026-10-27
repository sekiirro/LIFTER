export type PackageFailure = {
  status: 'denied' | 'invalid_input' | 'unavailable';
};
export type CreatePackageResult =
  { status: 'ok'; packageId: string } | PackageFailure;
export type PublishPackageResult =
  { status: 'ok'; versionId: string } | PackageFailure;
export type AvailabilityResult =
  { status: 'ok'; offerId: string } | PackageFailure;
export function mapPackageError(error: unknown): PackageFailure {
  if (error && typeof error === 'object') {
    const e = error as { code?: unknown; message?: unknown };
    if (e.code === '42501') return { status: 'denied' };
    if (e.code === '22023' && e.message === 'invalid_input')
      return { status: 'invalid_input' };
  }
  return { status: 'unavailable' };
}
