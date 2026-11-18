export const DELETION_AUTH_BAN_DURATION = '876000h';
const MAX_DELETION_BACKOFF_MS = 24 * 60 * 60 * 1000;

export const DELETION_SAFE_ERROR_CODES = [
  'provider_unavailable',
  'auth_admin_unavailable',
  'metadata_not_empty',
  'step_b_failed',
  'step_d_failed',
] as const;
export type DeletionSafeErrorCode = (typeof DELETION_SAFE_ERROR_CODES)[number];

/** Approved FR-025 financial-resolution copy (S41-PO-4 P6-P9, byte-exact). */
export const FINANCIAL_RESOLUTION_CATEGORIES = {
  refunded_outside_lifter: {
    en: 'Refunded outside LIFTER',
    ar: 'تم رد المبلغ خارج ليفتر',
  },
  forfeited_under_contract: {
    en: 'Forfeited under the contract',
    ar: 'تم التنازل عن المبلغ حسب العقد',
  },
  other: {
    en: 'Other',
    ar: 'سبب تاني',
  },
} as const;

export const FINANCIAL_RESOLUTION_ACKNOWLEDGEMENT = {
  en: 'I understand this only records the financial resolution. It does not process a refund, collect a payment, or cancel any subscription or debt.',
  ar: 'أنا فاهم إن ده مجرد تسجيل للتسوية المالية، ومش معناه إن ليفتر رجّع أي فلوس، أو حصّل أي مبالغ، أو ألغى أي اشتراكات أو مستحقات.',
} as const;

export function placeholderDeletionEmail(intentId: string): string {
  return `deleted+${intentId}@deleted.invalid`;
}

export function deletionSafeErrorCode(error: unknown): DeletionSafeErrorCode {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (
      typeof code === 'string' &&
      (DELETION_SAFE_ERROR_CODES as readonly string[]).includes(code)
    ) {
      return code as DeletionSafeErrorCode;
    }
  }
  return 'auth_admin_unavailable';
}

export function deletionRetryAt(attempt: number, now: Date): Date {
  if (
    !Number.isSafeInteger(attempt) ||
    attempt < 1 ||
    !Number.isFinite(now.getTime())
  ) {
    throw new Error('account_deletion_invalid_retry');
  }
  const backoffMs = Math.min(2 ** attempt * 60_000, MAX_DELETION_BACKOFF_MS);
  return new Date(now.getTime() + backoffMs);
}

/**
 * Build a metadata patch that nulls every key (including nonstandard/nested keys)
 * so GoTrue's merging user_metadata update removes them before step (D).
 */
export function buildClearedMetadataPayload(
  metadata: unknown,
): Record<string, null> | null {
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata)
  )
    return null;
  const keys = Object.keys(metadata);
  if (keys.length === 0) return null;
  const patch: Record<string, null> = {};
  for (const key of keys) patch[key] = null;
  return patch;
}

export function isMetadataEmpty(metadata: unknown): boolean {
  if (metadata === null || metadata === undefined) return true;
  if (typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  return Object.keys(metadata).length === 0;
}
