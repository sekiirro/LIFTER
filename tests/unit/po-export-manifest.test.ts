import { describe, expect, it } from 'vitest';
import { PO_EXPORT_FIELDS, PO_EXPORT_MANIFEST_VERSION } from '../../lib/po-export/manifest';
import { serializeCsv } from '../../lib/po-export/csv';

describe('approved PO export manifest (T005)', () => {
  it('exports only the approved fields in their stable versioned order', () => {
    expect(PO_EXPORT_MANIFEST_VERSION).toBe('030-v1');
    expect(PO_EXPORT_FIELDS.map(({ key }) => key)).toEqual([
      'clients.id',
      'clients.workspace_id',
      'clients.name',
      'clients.email_normalized',
      'clients.phone_e164',
      'clients.approval_state',
      'clients.created_at',
      'subscriptions.package_name',
      'subscriptions.status',
      'subscriptions.start_at',
      'subscriptions.expires_at',
      'client_trainer_assignments.trainer_name',
      'client_trainer_assignments.assigned_at',
      'forms.intake_submitted_at',
      'forms.fitness_goals',
    ]);
    expect(JSON.stringify(PO_EXPORT_FIELDS)).not.toContain('health_notes');
  });

  it('cannot serialize a health note through its allowed-field projection', () => {
    const input = [
      {
        'clients.id': 'client-1',
        'forms.fitness_goals': 'Build strength',
        'forms.health_notes': 'health-canary-not-for-export',
      },
    ];
    const output = serializeCsv(input, PO_EXPORT_FIELDS);
    expect(output).not.toContain('health_notes');
    expect(output).not.toContain('health-canary-not-for-export');
  });
});
