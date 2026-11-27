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
