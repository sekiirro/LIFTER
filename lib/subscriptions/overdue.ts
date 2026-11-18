import {
  addCairoDays,
  cairoDateAt,
  compareCairoDates,
} from '../time/cairo-calendar';

/**
 * F13 FR-028 independent overdue input. Pure mirror of
 * `app_private.f13_project_overdue` (migration 20261125010000); the SQL is authoritative.
 * Overdue never changes entitlement, freeze, expiry or refund state.
 */
export type OverdueObligation = {
  seq: number;
  /** Renewal obligations carry a stored due date. */
  renewal: boolean;
  storedDueOn: string | null;
  issuedDayOffset: number;
  /** Cairo-instant of initial activation; null until activated. */
  activatedAt: Date | string | null;
  /** The latest payment event is a collection. */
  paid: boolean;
  cancelled: boolean;
};

export type OverdueProjection = {
  overdue: boolean;
  overdueSince: string | null;
  firstOverdueSeq: number | null;
  overdueInstallmentCount: number;
};

/** Initial seq 1 has no due date (collected at approval); seq 2+ anchor to Cairo activation. */
export function obligationDueOn(obligation: OverdueObligation): string | null {
  if (obligation.renewal) return obligation.storedDueOn;
  if (obligation.seq === 1 || obligation.activatedAt === null) return null;
  return addCairoDays(
    cairoDateAt(obligation.activatedAt),
    obligation.issuedDayOffset,
  );
}

/** Payable through Cairo day-end: overdue only strictly after the due date. */
export function projectOverdue(
  obligations: readonly OverdueObligation[],
  asOfDate: string,
): OverdueProjection {
  const late = obligations
    .filter((o) => !o.paid && !o.cancelled)
    .map((o) => ({ seq: o.seq, dueOn: obligationDueOn(o) }))
    .filter(
      (o): o is { seq: number; dueOn: string } =>
        o.dueOn !== null && compareCairoDates(o.dueOn, asOfDate) < 0,
    )
    .sort((a, b) => compareCairoDates(a.dueOn, b.dueOn) || a.seq - b.seq);
  const first = late[0];
  return {
    overdue: late.length > 0,
    overdueSince: first?.dueOn ?? null,
    firstOverdueSeq: first?.seq ?? null,
    overdueInstallmentCount: late.length,
  };
}

export type ClientOverdueStatus =
  | { status: 'invalid' }
  | ({ status: 'ok' } & OverdueProjection & { reason: string | null });

/** Fail-closed parse of `public.client_overdue_status()`; any malformed value is `invalid`. */
export function parseClientOverdueStatus(value: unknown): ClientOverdueStatus {
  if (typeof value !== 'object' || value === null) return { status: 'invalid' };
  const v = value as Record<string, unknown>;
  if (
    v.status !== 'ok' ||
    typeof v.overdue !== 'boolean' ||
    !Number.isInteger(v.overdue_installment_count)
  )
    return { status: 'invalid' };
  const since = v.overdue_since;
  const seq = v.first_overdue_seq;
  if (
    v.overdue !== (v.overdue_installment_count as number) > 0 ||
    (v.overdue && (typeof since !== 'string' || !Number.isInteger(seq))) ||
    (!v.overdue && (since !== null || seq !== null))
  )
    return { status: 'invalid' };
  return {
    status: 'ok',
    overdue: v.overdue,
    overdueSince: (since as string | null) ?? null,
    firstOverdueSeq: (seq as number | null) ?? null,
    overdueInstallmentCount: v.overdue_installment_count as number,
    reason: typeof v.reason === 'string' ? v.reason : null,
  };
}
