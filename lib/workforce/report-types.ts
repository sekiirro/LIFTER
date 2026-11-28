export type StaffRole = 'trainer' | 'sales';

export type StaffTotal = {
  staff_user_id: string;
  role: StaffRole;
  display_name: string | null;
  points: string;
  is_negative: boolean;
};

export type LedgerCategory =
  | 'earned'
  | 'poAdjustment'
  | 'refundReversal'
  | 'planDelay'
  | 'checkinDelay'
  | 'transformationFeedback';

export type LedgerOperation = 'add' | 'deduct' | 'correct' | 'reattribute';

export type LedgerEntry = {
  id: string;
  staff_user_id: string;
  staff_role: StaffRole;
  staff_name: string | null;
  category: LedgerCategory;
  points: string;
  effective_month: string;
  original_month: string | null;
  actor: string | null;
  recorded_at: string;
  reason_code: string | null;
  reason: string | null;
  operation: LedgerOperation | null;
  original_entry_id: string | null;
  original_entry_kind: 'earned' | 'adjustment' | null;
};

export type MonthSnapshot = {
  id: string;
  snapshot_version: number;
  formula_version: string;
  source_watermark: string;
  totals: Record<string, string>;
  finalized_by: string;
  finalized_at: string;
};

export type WorkforceReportData = {
  workspace_id: string;
  month: string;
  status: 'closed' | 'current';
  is_closed: boolean;
  snapshot: MonthSnapshot | null;
  totals: StaffTotal[];
  trainers: StaffTotal[];
  sales: StaffTotal[];
  ledger: LedgerEntry[];
};

export type WorkforceReportResponse =
  | { status: 'ok'; data: WorkforceReportData }
  | { status: 'denied' }
  | { status: 'error'; message?: string };

export type SalesFunnelRow = {
  month: string;
  sales_user_id: string;
  link_count: number;
  registration_count: number;
  approval_count: number;
  first_payment_count: number;
  acquisition_point_count: number;
  acquisition_points: string;
  refund_reversal_count: number;
  refund_reversal_points: string;
  point_deduction_count: number;
  point_deduction_points: string;
  po_adjustment_count: number;
  po_adjustment_points: string;
};

export type SalesFunnelResponse =
  | { status: 'ok'; rows: SalesFunnelRow[] }
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'error' };
