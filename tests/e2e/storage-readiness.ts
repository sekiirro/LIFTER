export type StorageReadinessDisposition = 'ready' | 'excluded' | 'retry';

export function storageReadinessDisposition(
  status: number | null,
  consecutiveUnavailable = 0,
  requireStorage = false,
  responseMessage: string | null = null,
): StorageReadinessDisposition {
  if (status === 503)
    return !requireStorage && consecutiveUnavailable >= 3
      ? 'excluded'
      : 'retry';
  if (
    status === 200 ||
    status === 401 ||
    (status === 400 && responseMessage === 'Invalid Compact JWS')
  )
    return 'ready';
  return 'retry';
}
