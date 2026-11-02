export type AlertInboxRow = {
  delivery_id: string;
  workspace_id: string;
  source_assignment_id: string;
  stage: string;
  created_at: string;
  read_at: string | null;
};

export type AlertInboxRpc = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
};

const stages = new Set([
  'client_trainer_24h',
  'client_owners_24h',
  'client_owners_48h',
  'trainer_initial',
  'trainer_owners_24h',
]);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isRow(value: unknown): value is AlertInboxRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(',') !==
    'created_at,delivery_id,read_at,source_assignment_id,stage,workspace_id'
  )
    return false;
  return (
    typeof row.delivery_id === 'string' &&
    uuid.test(row.delivery_id) &&
    typeof row.workspace_id === 'string' &&
    uuid.test(row.workspace_id) &&
    typeof row.source_assignment_id === 'string' &&
    uuid.test(row.source_assignment_id) &&
    typeof row.stage === 'string' &&
    stages.has(row.stage) &&
    typeof row.created_at === 'string' &&
    (typeof row.read_at === 'string' || row.read_at === null)
  );
}

export async function readAlertInbox(
  client: AlertInboxRpc,
  limit = 50,
  before: string | null = null,
): Promise<{ ok: true; rows: AlertInboxRow[] } | { ok: false }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    return { ok: false };
  const { data, error } = await client.rpc('read_form_alert_inbox', {
    p_limit: limit,
    p_before: before,
  });
  if (error || !Array.isArray(data) || !data.every(isRow)) return { ok: false };
  return { ok: true, rows: data };
}

export async function markAlertRead(
  client: AlertInboxRpc,
  deliveryId: string,
): Promise<'read' | 'not_found' | 'unavailable'> {
  if (!uuid.test(deliveryId)) return 'not_found';
  const { data, error } = await client.rpc('mark_form_alert_read', {
    p_delivery_id: deliveryId,
  });
  if (error || !data || typeof data !== 'object') return 'unavailable';
  const status = (data as { status?: unknown }).status;
  return status === 'read' || status === 'not_found' ? status : 'unavailable';
}
