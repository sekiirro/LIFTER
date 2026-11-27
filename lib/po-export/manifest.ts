import type { ExportField } from './csv';

/** S71-PO-12 / S71-R27: health_notes is never an export field. */
export const PO_EXPORT_MANIFEST_VERSION = '030-v1' as const;

export const PO_EXPORT_FIELDS: readonly ExportField[] = [
  { key: 'clients.id', type: 'text' },
  { key: 'clients.workspace_id', type: 'text' },
  { key: 'clients.name', type: 'text' },
  { key: 'clients.email_normalized', type: 'text' },
  { key: 'clients.phone_e164', type: 'text' },
  { key: 'clients.approval_state', type: 'text' },
  { key: 'clients.created_at', type: 'text' },
  { key: 'subscriptions.package_name', type: 'text' },
  { key: 'subscriptions.status', type: 'text' },
  { key: 'subscriptions.start_at', type: 'text' },
  { key: 'subscriptions.expires_at', type: 'text' },
  { key: 'client_trainer_assignments.trainer_name', type: 'text' },
  { key: 'client_trainer_assignments.assigned_at', type: 'text' },
  { key: 'forms.intake_submitted_at', type: 'text' },
  { key: 'forms.fitness_goals', type: 'text' },
] as const;
