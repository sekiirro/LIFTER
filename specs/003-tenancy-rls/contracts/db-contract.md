# Contract: P0-F3

## TypeScript (`lib/auth`)

```ts
export const ROLES = ['platform_owner','workspace_owner','trainer','sales'] as const;
export type Role = typeof ROLES[number];
export const CAPABILITIES = [
  'set_package_pricing','generate_registration_link','configure_installment_schedule',
  'approve_registration','record_payment','manage_freeze','record_refund','delete_client',
  'export_client_dataset','manage_workspaces','manage_staff_access','coaching_work',
] as const;
export type Capability = typeof CAPABILITIES[number];
export function roleHasCapability(role: Role, capability: string): boolean; // unknown → false
export type Actor = { userId: string; role: Role | null; activeWorkspaceIds: readonly string[] };
export function authorize(actor: Actor, capability: string, workspaceId: string): boolean;
// PO → roleHasCapability; else role non-null AND workspaceId ∈ activeWorkspaceIds AND roleHasCapability
```


## Database

The schema is in [data-model.md](../data-model.md). Policy names follow `<table>_<op>_<who>`, e.g. `workspaces_select_member`.

## Test harness (`tests/integration/harness.ts`)

```ts
loadEnv(): { apiUrl; anonKey; serviceRoleKey; dbUrl }      // throws "Run `supabase start`" if missing
admin(): SupabaseClient                                     // service role
sql(): postgres.Sql                                         // DB_URL; caller ends it
createStaff(role: Role | null, label: string): Promise<{ userId; email; client: SupabaseClient }>
anonClient(): SupabaseClient
twoWorkspaceFixture(): Promise<{ wsA; wsB; po; woA; trainerA; salesA; trainerB; cleanupNote }>
```

Emails follow `f3+<label>-<random>@example.test`. Passwords are random per run. Nothing is persisted outside the local DB.
