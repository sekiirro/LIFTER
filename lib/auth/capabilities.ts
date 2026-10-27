export const ROLES = [
  'platform_owner',
  'workspace_owner',
  'trainer',
  'sales',
] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  'generate_recovery_link',
  'set_package_pricing',
  'generate_registration_link',
  'configure_installment_schedule',
  'approve_registration',
  'record_payment',
  'manage_freeze',
  'record_refund',
  'delete_client',
  'export_client_dataset',
  'manage_workspaces',
  'manage_staff_access',
  'coaching_work',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const MATRIX: Readonly<Record<Role, readonly Capability[]>> = {
  platform_owner: CAPABILITIES,
  workspace_owner: [
    'generate_recovery_link',
    'generate_registration_link',
    'configure_installment_schedule',
    'approve_registration',
    'record_payment',
    'manage_freeze',
    'coaching_work',
  ],
  trainer: ['generate_registration_link', 'coaching_work'],
  sales: [
    'generate_registration_link',
    'configure_installment_schedule',
    'approve_registration',
    'record_payment',
    'manage_freeze',
  ],
};

export function roleHasCapability(role: Role, capability: string): boolean {
  return MATRIX[role].some((allowed) => allowed === capability);
}
