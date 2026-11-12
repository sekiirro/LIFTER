import { existsSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from './harness';
import { functions as approvalFunctions } from './registration-approval-fixture';
import {
  registrationFixture,
  issue,
  checked,
} from './registration-links-fixture';

const db = sql();
const signupPrivate = [
  'signup_constant_time_equal',
  'signup_attestation_matches',
  'signup_attestation_timing',
  'signup_attempt_purge_proof',
  'purge_client_signup_attempts',
  'purge_schedule_activate',
  'purge_schedule_deactivate',
  'signup_auth_schema_compatible',
  'signup_bcrypt_cost',
  'signup_reserved_usernames',
  'signup_password_acceptable',
  'signup_link_key_matches',
  'signup_identity_normalization',
  'signup_auth_identity_column',
  'signup_password_policy',
  'signup_field_contract',
  'signup_reserved_usernames',
  'signup_consumption_policy',
  'client_signup_limits',
  'signup_completion_policy',
  'signup_retention_policy',
  'signup_authenticated_visitor_policy',
  'signup_identifier_scope_policy',
  'client_signup_audit_contract',
  'signup_lock_identity_keys',
  'signup_guard_claim_write',
  'sync_account_identifier_claims',
  'guard_account_identity_kind',
  'guard_client_signup_insert',
  'check_client_signup_integrity',
  'guard_client_signup_operation',
  'signup_ticket_redemption_proof',
  'signup_guard_ticket_update',
  'redeem_signup_admission_ticket',
  'signup_guard_attempt_delete',
];
const registrationPrivate = [
  'registration_link_is_valid',
  'registration_link_limits',
  'guard_registration_link_insert',
  'guard_registration_link_update',
  'guard_registration_installment_insert',
  'validate_registration_link_schedule',
  'check_registration_link_schedule',
  'f13_audit_freeze',
  'f13_audit_renewal',
  'f13_audit_renewal_date_revision',
  'f13_audit_refund_ledger',
  'f13_check_freeze',
  'f13_check_refund_ledger',
  'f13_freeze_contribution',
  'f13_freeze_event_guard',
  'f13_freeze_guard',
  'f13_reflow_unstarted_renewal',
  'f13_guard_terminal_payment',
  'f13_validate_freeze',
  'f13_validate_renewal',
  'f13_validate_refund_ledger',
  'f15_alert_occurrence_authorize_insert',
  'f15_alert_recipient_authorized',
  'f15_alert_schedule_audit',
  'write_f15_in_app_alert',
  'f15_alert_inbox_after_occurrence',
  'f15_telegram_membership_revoke',
  'consume_f15_telegram_link_token',
  'consume_f15_telegram_start',
];
const brandingPrivate = [
  'branding_actor_id',
  'branding_asset_attach',
  'branding_credential_event_immutable',
  'branding_credential_register',
  'branding_credential_set_enabled',
  'branding_credential_allowed',
  'branding_current_read',
  'branding_draft_read',
  'branding_draft_save',
  'branding_gc_claim',
  'branding_gc_finalize',
  'branding_gc_lock_object',
  'branding_publish',
  'branding_render_handles_cleanup',
  'branding_asset_context',
  'branding_staging_upload_allowed',
  'branding_storage_read_allowed',
  'branding_upload_begin',
  'branding_validation_prepare',
  'branding_validation_complete',
  'branding_validator_upload_binding_matches',
  'branding_validator_upload_binding_matches_gc',
  'branding_validator_upload_binding_matches_gc_serialized',
];
const brandingFunctionOwners: Record<string, string> = {
  branding_validator_upload_binding_matches: 'branding_upload_check_definer',
};
afterAll(async () => {
  await db.end();
});

describe('recovery security catalog', () => {
  it('forces RLS with no policies and no API privileges', async () => {
    const [table] =
      await db`select relrowsecurity, relforcerowsecurity from pg_catalog.pg_class where oid = 'public.recovery_link_issuances'::regclass`;
    expect(table).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });
    const policies =
      await db`select * from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'recovery_link_issuances'`;
    expect(policies).toHaveLength(0);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const privilege of [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
        'MAINTAIN',
      ]) {
        const [row] =
          await db`select has_table_privilege(${role}, 'public.recovery_link_issuances', ${privilege}) as allowed`;
        expect(row?.allowed).toBe(false);
      }
    }
  });
  it('attaches insert audit and update/delete/truncate guards', async () => {
    const triggers =
      await db`select tgname, tgtype::int as type from pg_catalog.pg_trigger where tgrelid = 'public.recovery_link_issuances'::regclass and not tgisinternal order by tgname`;
    expect(triggers).toEqual([
      { tgname: 'audit_recovery_link_issuances', type: 5 },
      { tgname: 'recovery_link_issuances_no_delete', type: 11 },
      { tgname: 'recovery_link_issuances_no_truncate', type: 34 },
      { tgname: 'recovery_link_issuances_no_update', type: 19 },
    ]);
  });
  it('hardens all five recovery functions and grants only the public RPCs to authenticated', async () => {
    for (const name of [
      'app_private.recovery_target_workspace(uuid)',
      'app_private.recovery_link_limits()',
      'app_private.recovery_link_guard(uuid)',
      'public.recovery_link_authorize(uuid)',
      'public.recovery_link_record(uuid)',
    ]) {
      const [fn] =
        await db`select prosecdef, proconfig, pg_catalog.pg_get_userbyid(proowner) as owner from pg_catalog.pg_proc where oid = ${name}::regprocedure`;
      expect(fn?.prosecdef).toBe(!name.includes('recovery_link_limits'));
      expect(fn?.owner).toBe('postgres');
      expect(fn?.proconfig).toContain('search_path=""');
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const [grant] =
          await db`select has_function_privilege(${role}, ${name}, 'EXECUTE') as allowed`;
        expect(grant?.allowed).toBe(
          role === 'authenticated' && name.startsWith('public.'),
        );
      }
    }
  });
});

describe('tenancy security catalog (T007)', () => {
  it.each(['staff_profiles', 'workspaces', 'workspace_memberships'])(
    '%s forces RLS and has least-privilege grants',
    async (table) => {
      const rows =
        await db`select relrowsecurity, relforcerowsecurity from pg_catalog.pg_class where oid = ${`public.${table}`}::regclass`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) {
        const [row] =
          await db`select has_table_privilege('anon', ${`public.${table}`}, ${privilege}) as allowed`;
        expect(row?.allowed).toBe(false);
        const [authenticated] =
          await db`select has_table_privilege('authenticated', ${`public.${table}`}, ${privilege}) as allowed`;
        expect(authenticated?.allowed).toBe(
          table !== 'workspaces' || privilege !== 'UPDATE',
        );
      }
      const [row] =
        await db`select has_table_privilege('authenticated', ${`public.${table}`}, 'DELETE') as allowed`;
      expect(row?.allowed).toBe(false);
    },
  );

  it.each(['id', 'created_by', 'created_at'])(
    'authenticated cannot update workspaces.%s',
    async (column) => {
      const [row] =
        await db`select has_column_privilege('authenticated', 'public.workspaces', ${column}, 'UPDATE') as allowed`;
      expect(row?.allowed).toBe(false);
    },
  );

  it.each(['name', 'slug'])(
    'authenticated can update workspaces.%s subject to RLS',
    async (column) => {
      const [row] =
        await db`select has_column_privilege('authenticated', 'public.workspaces', ${column}, 'UPDATE') as allowed`;
      expect(row?.allowed).toBe(true);
    },
  );

  it('all private functions have hardened ownership, search path and execute grants', async () => {
    const rows = await db`
      select p.proname, p.prosecdef, p.proconfig, pg_catalog.pg_get_userbyid(p.proowner) as owner,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private'`;
    expect([...new Set(rows.map((row) => row.proname))].sort()).toEqual(
      [
        ...new Set([
          ...registrationPrivate,
          ...approvalFunctions.map((signature) => signature.split('(')[0]!),
          'client_has_access',
          ...signupPrivate,
          ...brandingPrivate,
          'audit_events_immutable',
          'audit_row_change',
          'apply_food_default_alternatives',
          'catalog_can_read_global',
          'catalog_create_food_legacy',
          'catalog_food_duplicate_exists',
          'catalog_food_writer_authorized',
          'catalog_video_url_allowed',
          'catalog_version_food_legacy',
          'catalog_write_audit',
          'claim_catalog_operation',
          'current_staff_role',
          'enqueue_job',
          'forbid_delete',
          'f13_actor_preflight',
          'f13_create_refund_lockout_alert',
          'f13_materialize_entitlement',
          'f13_project_entitlement',
          'f13_audit_client_deactivation',
          'guard_membership_update',
          'guard_package_offer_update',
          'guard_package_version_insert',
          'has_workspace_access',
          'is_platform_owner',
          'jobs_updated_at',
          'materialize_intake_assignment_occurrence_core',
          'evaluate_forms_alerts_core',
          'copy_workspace_form',
          'ensure_default_onboarding_form',
          'f15_onboarding_provisioning_marker_immutable',
          'f15_alert_schedule_activate',
          'f15_alert_schedule_deactivate',
          'f15_alert_schedule_immutable',
          'f15_alert_schedule_run',
          'f15_client_alert_schedule_insert',
          'f15_forms_purge_run',
          'f15_forms_purge_run_batch',
          'f15_forms_purge_schedule_activate',
          'f15_forms_purge_schedule_deactivate',
          'purge_ended_form_answers_at',
          'record_f15_retention_fact',
          'f15_builder_cached_result',
          'f15_builder_store_result',
          'f15_current_terms_policy',
          'f15_answer_is_present',
          'f15_answer_values_valid',
          'f15_approval_reconcile_trigger',
          'f15_is_assigned_answer',
          'f15_is_assigned_client',
          'f15_question_applies',
          'f15_selection_reconcile_trigger',
          'f15_submission_complete',
          'cancel_f15_client_alerts',
          'enforce_form_revision_snapshot_keys',
          'enforce_n08_budget_answer_consistency',
          'f15_cancel_client_alerts_after_relationship_end',
          'f15_client_alert_lifecycle_active',
          'archive_f15_selection_update',
          ...(existsSync(
            'supabase/migrations/20261112031000_f15_signup_main_reconciliation.sql',
          )
            ? ['f15_valid_slider_label']
            : []),
          'f15_valid_builder_definition',
          'guard_f15_assignment_fact',
          'guard_f15_form_assignment',
          'guard_f15_form_version',
          'guard_form_answer_revision_immutable',
          'guard_form_correction_immutable',
          'guard_form_draft_after_submission',
          'guard_form_erasure_control',
          'guard_form_legal_hold',
          'guard_form_retention_window',
          'publish_workspace_form',
          'purge_ended_form_answers',
          'reconcile_f15_form_assignment',
          'resolve_default_onboarding_configuration',
          'retire_workspace_form',
          'retire_workspace_form',
          'save_workspace_form_draft',
          'set_default_onboarding_form',
          'prevent_consent_receipt_mutation',
          'stamp_form_purge_deadline',
          'signup_auth_identity_column',
          'lock_catalog_food_request',
          'normalize_ar_en_v1',
          'normalize_catalog_food_identity_v1',
          'operation_key_fields_immutable',
          'operation_key_result',
          'operation_key_retention_days',
          'purge_f11_retained_data',
          'purge_operation_keys',
          'recovery_link_guard',
          'recovery_link_limits',
          'recovery_target_workspace',
          'role_has_capability',
          'register_f15_trainer_alert_schedule',
          'reject_catalog_provenance_change',
          'reject_catalog_version_mutation',
          'release_catalog_food_keys',
          'require_food_version_serving',
          'reserve_catalog_food_keys',
          'set_catalog_operation_result',
          'sync_catalog_addition_limits',
          'validate_exercise_payload',
          'validate_food_request',
        ]),
      ].sort(),
    );
    for (const row of rows) {
      expect(row.prosecdef, row.proname).toBe(
        ![
          'audit_events_immutable',
          'f15_answer_is_present',
          // FR-008's snapshot validator is intentionally pure, immutable, and invoker-mode.
          // See 20261112031600_f15_direct_rpc_answer_validation.sql:3-108.
          'f15_answer_values_valid',
          'f15_question_applies',
          'f15_submission_complete',
          'f15_valid_builder_definition',
          'f15_valid_slider_label',
          'guard_form_answer_revision_immutable',
          'guard_form_correction_immutable',
          'f15_onboarding_provisioning_marker_immutable',
          'f15_alert_schedule_activate',
          'f15_alert_schedule_deactivate',
          'f15_alert_schedule_immutable',
          'f15_alert_schedule_run',
          'f15_forms_purge_run',
          'f15_forms_purge_run_batch',
          'f15_forms_purge_schedule_activate',
          'f15_forms_purge_schedule_deactivate',
          'register_f15_trainer_alert_schedule',
          'branding_actor_id',
          'forbid_delete',
          'jobs_updated_at',
          'recovery_link_limits',
          'registration_link_limits',
          'purge_schedule_activate',
          'purge_schedule_deactivate',
          'normalize_ar_en_v1',
          'normalize_catalog_food_identity_v1',
          'operation_key_fields_immutable',
          'purge_f11_retained_data',
          'validate_food_request',
          'reject_catalog_provenance_change',
          'reject_catalog_version_mutation',
        ].includes(row.proname),
      );
      expect(row.proconfig).toContain('search_path=""');
      expect(row.owner).toBe(
        brandingFunctionOwners[row.proname] ??
          (brandingPrivate.includes(row.proname)
            ? 'branding_definer'
            : 'postgres'),
      );
      expect(row.anon_execute).toBe(false);
      if (row.proname === 'signup_auth_identity_column') {
        // 20261108230000 revokes EXECUTE from PUBLIC, anon, authenticated, and service_role.
        expect(row.service_role_execute, row.proname).toBe(false);
      }
      if (row.proname === 'archive_f15_selection_update') {
        expect(row.service_role_execute, row.proname).toBe(false);
      }
      expect(row.authenticated_execute, row.proname).toBe(
        [
          'branding_upload_begin',
          'branding_draft_save',
          'branding_asset_attach',
          'branding_publish',
          'branding_current_read',
          'branding_draft_read',
          'branding_staging_upload_allowed',
        ].includes(row.proname) ||
          (!row.proname.startsWith('f12_') &&
            !row.proname.startsWith('f13_') &&
            !registrationPrivate.includes(row.proname) &&
            !brandingPrivate.includes(row.proname) &&
            !signupPrivate.includes(row.proname) &&
            ![
              'apply_food_default_alternatives',
              'audit_events_immutable',
              'audit_row_change',
              'catalog_create_food_legacy',
              'catalog_food_duplicate_exists',
              'catalog_food_writer_authorized',
              'catalog_version_food_legacy',
              'catalog_write_audit',
              'claim_catalog_operation',
              'client_has_access',
              'copy_workspace_form',
              'enqueue_job',
              'ensure_default_onboarding_form',
              'f15_builder_cached_result',
              'f15_builder_store_result',
              'f15_forms_purge_run',
              'f15_forms_purge_run_batch',
              'f15_forms_purge_schedule_activate',
              'f15_forms_purge_schedule_deactivate',
              'purge_ended_form_answers_at',
              'record_f15_retention_fact',
              'f15_onboarding_provisioning_marker_immutable',
              'guard_form_answer_revision_immutable',
              'guard_form_correction_immutable',
              'guard_form_draft_after_submission',
              'guard_form_erasure_control',
              'guard_form_legal_hold',
              'guard_form_retention_window',
              'prevent_consent_receipt_mutation',
              'signup_reserved_usernames',
              'f15_current_terms_policy',
              'f15_alert_schedule_activate',
              'f15_alert_schedule_deactivate',
              'f15_alert_schedule_immutable',
              'f15_alert_schedule_run',
              'f15_client_alert_schedule_insert',
              'register_f15_trainer_alert_schedule',
              'evaluate_forms_alerts_core',
              'materialize_intake_assignment_occurrence_core',
              'f15_answer_is_present',
              'f15_answer_values_valid',
              'f15_approval_reconcile_trigger',
              'f15_selection_reconcile_trigger',
              'f15_question_applies',
              'f15_submission_complete',
              'f15_valid_slider_label',
              'f15_valid_builder_definition',
              'cancel_f15_client_alerts',
              'enforce_form_revision_snapshot_keys',
              'enforce_n08_budget_answer_consistency',
              'f15_cancel_client_alerts_after_relationship_end',
              'f15_client_alert_lifecycle_active',
              'guard_f15_assignment_fact',
              'reconcile_f15_form_assignment',
              'archive_f15_selection_update',
              'guard_f15_form_assignment',
              'guard_f15_form_version',
              'purge_ended_form_answers',
              'publish_workspace_form',
              'resolve_default_onboarding_configuration',
              'retire_workspace_form',
              'save_workspace_form_draft',
              'set_default_onboarding_form',
              'signup_auth_identity_column',
              'stamp_form_purge_deadline',
              'f13_audit_client_deactivation',
              'forbid_delete',
              'guard_package_offer_update',
              'guard_package_version_insert',
              'jobs_updated_at',
              'lock_catalog_food_request',
              'normalize_catalog_food_identity_v1',
              'operation_key_fields_immutable',
              'operation_key_result',
              'operation_key_retention_days',
              'purge_f11_retained_data',
              'purge_operation_keys',
              'recovery_link_guard',
              'recovery_link_limits',
              'recovery_target_workspace',
              'reject_catalog_provenance_change',
              'reject_catalog_version_mutation',
              'release_catalog_food_keys',
              'require_food_version_serving',
              'reserve_catalog_food_keys',
              'set_catalog_operation_result',
              'sync_catalog_addition_limits',
              'validate_exercise_payload',
              'validate_food_request',
            ].includes(row.proname)),
      );
    }
  });

  it('keeps the first-provision marker forced-RLS, API-private, and immutable', async () => {
    const [marker] = await db`
      select c.relrowsecurity,c.relforcerowsecurity
      from pg_catalog.pg_class c
      where c.oid='app_private.workspace_onboarding_provisioning'::regclass`;
    expect(marker).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const [grant] = await db`
          select has_table_privilege(${role},'app_private.workspace_onboarding_provisioning',${privilege}) as allowed`;
        expect(grant?.allowed).toBe(false);
      }
    }
    const triggers = await db`
      select tgname,tgenabled from pg_catalog.pg_trigger
      where tgrelid='app_private.workspace_onboarding_provisioning'::regclass and not tgisinternal`;
    expect(triggers).toEqual([
      {
        tgname: 'f15_onboarding_provisioning_marker_immutable',
        tgenabled: 'O',
      },
    ]);
  });
});

describe('audit security catalog (T005)', () => {
  it.each(['workspaces', 'staff_profiles', 'workspace_memberships'])(
    '%s has row DELETE and statement TRUNCATE guards',
    async (table) => {
      const triggers = await db`
        select t.tgname, t.tgtype::int as type, t.tgenabled
        from pg_catalog.pg_trigger t
        join pg_catalog.pg_proc p on p.oid = t.tgfoid
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where t.tgrelid = ${`public.${table}`}::regclass and not t.tgisinternal
          and n.nspname = 'app_private' and p.proname = 'forbid_delete'
        order by t.tgname`;
      expect(triggers).toEqual([
        { tgname: `${table}_no_delete`, type: 11, tgenabled: 'O' },
        { tgname: `${table}_no_truncate`, type: 34, tgenabled: 'O' },
      ]);
      const [guard] = await db`
        select has_function_privilege('service_role', 'app_private.forbid_delete()', 'EXECUTE') as allowed`;
      expect(guard?.allowed).toBe(false);
    },
  );

  it('forces RLS and grants only authenticated SELECT', async () => {
    const [table] =
      await db`select relrowsecurity, relforcerowsecurity from pg_catalog.pg_class where oid = 'public.audit_events'::regclass`;
    expect(table).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const privilege of [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
      ]) {
        const [row] =
          await db`select has_table_privilege(${role}, 'public.audit_events', ${privilege}) as allowed`;
        expect(row?.allowed).toBe(
          role === 'authenticated' && privilege === 'SELECT',
        );
      }
    }
    const [policy] =
      await db`select cmd, roles from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'audit_events' and policyname = 'audit_events_select_scoped'`;
    expect(policy).toMatchObject({ cmd: 'SELECT', roles: ['authenticated'] });
  });

  it('attaches all emitters plus row and statement immutability guards', async () => {
    // All emitters plus the separate TRUNCATE statement trigger.
    const triggers = await db`
      select t.tgname, c.relname, t.tgtype::int as type, t.tgenabled, p.proname
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'public' and not t.tgisinternal
        and p.proname in ('audit_row_change', 'audit_events_immutable')
      order by t.tgname,c.relname`;
    expect(triggers).toEqual([
      {
        tgname: 'audit_client_approval',
        relname: 'clients',
        type: 17,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_client_signup',
        relname: 'clients',
        type: 5,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_events_immutable',
        relname: 'audit_events',
        type: 27,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'audit_events_no_truncate',
        relname: 'audit_events',
        type: 34,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'audit_jobs',
        relname: 'jobs',
        type: 17,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_package_offers',
        relname: 'package_offers',
        type: 17,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_package_versions',
        relname: 'package_versions',
        type: 5,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_packages',
        relname: 'packages',
        type: 5,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_payment_events',
        relname: 'payment_events',
        type: 5,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_recovery_link_issuances',
        relname: 'recovery_link_issuances',
        type: 5,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_registration_links_issued',
        relname: 'registration_links',
        type: 5,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_registration_links_opened',
        relname: 'registration_links',
        type: 17,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_staff_profiles',
        relname: 'staff_profiles',
        type: 21,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_workspace_memberships',
        relname: 'workspace_memberships',
        type: 21,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_workspaces',
        relname: 'workspaces',
        type: 21,
        tgenabled: 'O',
        proname: 'audit_row_change',
      },
      {
        tgname: 'f12_no_update',
        relname: 'payment_events',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'f12_no_update',
        relname: 'subscription_activations',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'f12_no_update',
        relname: 'subscription_installments',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'f12_no_update',
        relname: 'subscriptions',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'f13_no_update',
        relname: 'refund_allocation_events',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'f13_no_update',
        relname: 'refund_operations',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'f13_no_update',
        relname: 'subscription_freeze_events',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'f13_no_update',
        relname: 'subscription_freezes',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'f13_no_update',
        relname: 'subscription_obligation_cancellations',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'f13_no_update',
        relname: 'subscription_renewal_date_revisions',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'f13_no_update',
        relname: 'subscription_renewals',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'package_versions_no_update',
        relname: 'package_versions',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'packages_no_update',
        relname: 'packages',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'recovery_link_issuances_no_update',
        relname: 'recovery_link_issuances',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
      {
        tgname: 'registration_link_installments_no_update',
        relname: 'registration_link_installments',
        type: 19,
        tgenabled: 'O',
        proname: 'audit_events_immutable',
      },
    ]);
    const [emitter] = await db`select p.prosecdef, p.proconfig,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private' and p.proname = 'audit_row_change'`;
    expect(emitter?.prosecdef).toBe(true);
    expect(emitter?.proconfig).toContain('search_path=""');
    expect(emitter?.service_execute).toBe(false);
  });
});

describe('jobs security catalog (T006)', () => {
  it('forces RLS and grants service_role SELECT only', async () => {
    const [table] =
      await db`select relrowsecurity, relforcerowsecurity from pg_catalog.pg_class where oid = 'public.jobs'::regclass`;
    expect(table).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const privilege of [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
        'MAINTAIN',
      ]) {
        const [row] =
          await db`select has_table_privilege(${role}, 'public.jobs', ${privilege}) as allowed`;
        expect(row?.allowed).toBe(
          role === 'service_role' && privilege === 'SELECT',
        );
      }
    }
  });

  it('hardens RPC ownership/search paths and restricts execution to service_role', async () => {
    const functions = [
      'public.jobs_claim(integer,integer)',
      'public.jobs_complete(uuid,uuid)',
      'public.jobs_fail(uuid,uuid,text,boolean)',
      'app_private.enqueue_job(text,uuid,jsonb,text,timestamptz,integer)',
    ];
    for (const name of functions) {
      const [fn] =
        await db`select prosecdef, proconfig, pg_catalog.pg_get_userbyid(proowner) as owner from pg_catalog.pg_proc where oid = ${name}::regprocedure`;
      expect(fn).toMatchObject({ prosecdef: true, owner: 'postgres' });
      expect(fn?.proconfig).toContain('search_path=""');
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const [row] =
          await db`select has_function_privilege(${role}, ${name}, 'EXECUTE') as allowed`;
        expect(row?.allowed).toBe(
          role === 'service_role' && name.startsWith('public.'),
        );
      }
    }
  });
});

describe('package security catalog', () => {
  it.each(['packages', 'package_offers', 'package_versions'])(
    '%s forces RLS, scoped SELECT and no API writes',
    async (table) => {
      const relation = `public.${table}`;
      const [row] =
        await db`select relrowsecurity,relforcerowsecurity from pg_class where oid=${relation}::regclass`;
      expect(row).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
      const policies =
        await db`select policyname,cmd,roles,qual from pg_policies where schemaname='public' and tablename=${table}`;
      expect(policies).toHaveLength(1);
      expect(policies[0]).toMatchObject({
        policyname: `${table}_select_scoped`,
        cmd: 'SELECT',
        roles: ['authenticated'],
      });
      expect(policies[0]?.qual).toContain('generate_registration_link');
      for (const role of ['anon', 'authenticated', 'service_role'])
        for (const privilege of [
          'SELECT',
          'INSERT',
          'UPDATE',
          'DELETE',
          'TRUNCATE',
          'REFERENCES',
          'TRIGGER',
        ]) {
          const [grant] =
            await db`select has_table_privilege(${role},${relation},${privilege}) as allowed`;
          expect(grant?.allowed).toBe(
            role === 'authenticated' &&
              privilege === 'SELECT' &&
              table !== 'package_versions',
          );
        }
      const triggers =
        await db`select tgname,tgtype::int as type,tgenabled from pg_trigger where tgrelid=${relation}::regclass and not tgisinternal order by tgname`;
      const expected = [
        { tgname: `${table}_no_delete`, type: 11, tgenabled: 'O' },
        { tgname: `${table}_no_truncate`, type: 34, tgenabled: 'O' },
      ];
      if (table === 'package_offers')
        expected.push(
          { tgname: 'package_offers_guard', type: 19, tgenabled: 'O' },
          { tgname: 'audit_package_offers', type: 17, tgenabled: 'O' },
        );
      else {
        expected.push(
          { tgname: `${table}_no_update`, type: 19, tgenabled: 'O' },
          { tgname: `audit_${table}`, type: 5, tgenabled: 'O' },
        );
        if (table === 'package_versions')
          expected.push({
            tgname: 'package_versions_insert_guard',
            type: 7,
            tgenabled: 'O',
          });
      }
      expect(triggers).toEqual(
        expected.sort((a, b) => a.tgname.localeCompare(b.tgname)),
      );
    },
  );
  it('grants only safe columns and uses an exact-text security-invoker view', async () => {
    const columns =
      await db`select column_name from information_schema.columns where table_schema='public' and table_name='package_versions' order by ordinal_position`;
    for (const column of columns)
      for (const role of ['authenticated', 'anon', 'service_role']) {
        const [grant] =
          await db`select has_column_privilege(${role},'public.package_versions',${column.column_name},'SELECT') as allowed`;
        expect(grant?.allowed).toBe(
          role === 'authenticated' &&
            column.column_name !== 'commission_rate_bp',
        );
      }
    const [view] =
      await db`select reloptions,pg_get_viewdef(oid) as definition from pg_class where oid='public.package_versions_safe'::regclass`;
    expect(view?.reloptions).toContain('security_invoker=true');
    expect(view?.definition).toMatch(/price_minor\)?::text/);
    expect(view?.definition).not.toContain('commission_rate_bp');
    expect(view?.definition).not.toContain('*');
    const projection =
      await db`select column_name,data_type from information_schema.columns where table_schema='public' and table_name='package_versions_safe' order by ordinal_position`;
    expect(projection.map((r) => r.column_name)).toEqual([
      'workspace_id',
      'id',
      'offer_id',
      'version',
      'name_ar',
      'name_en',
      'price_minor',
      'currency',
      'duration_days',
      'duration_months',
      'published_at',
      'published_by',
    ]);
    expect(
      projection.find((r) => r.column_name === 'price_minor')?.data_type,
    ).toBe('text');
  });
  it('has all restrictive foreign keys including workspace pair and same-offer triple', async () => {
    const fks =
      await db`select conrelid::regclass::text as tbl,pg_get_constraintdef(oid) as definition from pg_constraint where contype='f' and conrelid in ('public.packages'::regclass,'public.package_offers'::regclass,'public.package_versions'::regclass)`;
    expect(fks).toHaveLength(8);
    for (const fk of fks) expect(fk.definition).toContain('ON DELETE RESTRICT');
    for (const definition of [
      'FOREIGN KEY (workspace_id, offer_id) REFERENCES package_offers(workspace_id, id) ON DELETE RESTRICT',
      'FOREIGN KEY (workspace_id, current_version_id) REFERENCES package_versions(workspace_id, id) ON DELETE RESTRICT',
      'FOREIGN KEY (workspace_id, current_version_id, id) REFERENCES package_versions(workspace_id, id, offer_id) ON DELETE RESTRICT',
    ])
      expect(fks.map((f) => f.definition)).toContain(definition);
  });
  it('hardens all four package RPCs and two private guards', async () => {
    for (const name of [
      'public.create_package(text)',
      'public.publish_package_version(uuid,uuid,smallint,integer,text,text,bigint,text,integer)',
      'public.publish_package_version(uuid,uuid,smallint,integer,smallint,text,text,bigint,text,integer)',
      'public.set_package_offer_available(uuid,uuid,boolean)',
      'public.get_package_version_commissions(uuid)',
      'app_private.guard_package_offer_update()',
      'app_private.guard_package_version_insert()',
    ]) {
      const [fn] =
        await db`select prosecdef,proconfig,provolatile,pg_get_userbyid(proowner) as owner from pg_proc where oid=${name}::regprocedure`;
      expect(fn).toMatchObject({ prosecdef: true, owner: 'postgres' });
      expect(fn?.proconfig).toContain('search_path=""');
      expect(fn?.provolatile).toBe(name.includes('commissions') ? 's' : 'v');
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const [grant] =
          await db`select has_function_privilege(${role},${name},'EXECUTE') as allowed`;
        expect(grant?.allowed).toBe(
          role === 'authenticated' &&
            name.startsWith('public.') &&
            !name.includes('uuid,uuid,smallint,integer,text'),
        );
      }
    }
  });
});

describe('registration security catalog', () => {
  it.each(['registration_links', 'registration_link_installments'])(
    '%s forced RLS, scoped policies, all enabled guards',
    async (table) => {
      const [r] =
        await db`select relrowsecurity,relforcerowsecurity from pg_class where oid=${'public.' + table}::regclass`;
      expect(r).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
      const policies =
        await db`select cmd,qual,roles,with_check from pg_policies where schemaname='public' and tablename=${table}`;
      // Count every policy, including any granted TO PUBLIC: PostgreSQL applies
      // such policies to authenticated users too, so a stray permissive policy
      // must fail before the role-filtered assertions below run.
      expect(policies).toHaveLength(table === 'registration_links' ? 2 : 1);
      const apiPolicies = policies.filter((policy) =>
        policy.roles.includes('authenticated'),
      );
      const definerPolicies = policies.filter((policy) =>
        policy.roles.includes('branding_definer'),
      );
      expect(apiPolicies).toHaveLength(1);
      expect(apiPolicies[0]!.cmd).toBe('SELECT');
      expect(apiPolicies[0]!.qual).toContain('generate_registration_link');
      if (table === 'registration_links') {
        expect(definerPolicies).toHaveLength(1);
        expect(definerPolicies[0]!.cmd).toBe('ALL');
        expect(definerPolicies[0]!.qual).toBe('true');
      } else {
        expect(definerPolicies).toHaveLength(0);
      }
      const triggers =
        await db`select tgname,tgenabled,tgdeferrable,tginitdeferred from pg_trigger where tgrelid=${'public.' + table}::regclass and not tgisinternal`;
      expect(triggers.length).toBe(table === 'registration_links' ? 7 : 5);
      for (const t of triggers) {
        expect(t.tgenabled).toBe('O');
        if (t.tgname.includes('schedule') || t.tgname.endsWith('_issued'))
          expect(t).toMatchObject({ tgdeferrable: true, tginitdeferred: true });
      }
      for (const role of ['anon', 'authenticated', 'service_role'])
        for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
          const [grant] =
            await db`select has_table_privilege(${role},${'public.' + table},${privilege}) as allowed`;
          expect(grant!.allowed).toBe(false);
        }
    },
  );
  it('uses invoker exact-text safe projections; secret grants absent', async () => {
    for (const [view, amount] of [
      ['registration_links_safe', 'price_minor'],
      ['registration_link_installments_safe', 'amount_minor'],
    ] as const) {
      const [r] =
        await db`select reloptions,pg_get_viewdef(oid) as definition from pg_class where oid=${'public.' + view}::regclass`;
      expect(r!.reloptions).toContain('security_invoker=true');
      expect(r!.definition).toContain('::text');
      expect(r!.definition).not.toMatch(/token_hash|commission_rate_bp/);
      const [c] =
        await db`select data_type from information_schema.columns where table_schema='public' and table_name=${view} and column_name=${amount}`;
      expect(c!.data_type).toBe('text');
      const columns =
        await db`select column_name from information_schema.columns where table_schema='public' and table_name=${view} order by ordinal_position`;
      expect(columns.map((c) => c.column_name)).toEqual(
        view === 'registration_links_safe'
          ? [
              'workspace_id',
              'id',
              'package_version_id',
              'created_by',
              'created_at',
              'expires_at',
              'opened_at',
              'consumed_at',
              'price_minor',
              'currency',
              'duration_days',
              'duration_months',
            ]
          : [
              'workspace_id',
              'link_id',
              'seq',
              'amount_minor',
              'due_offset_days',
            ],
      );
    }
    for (const role of ['anon', 'authenticated', 'service_role'])
      for (const c of ['token_hash', 'commission_rate_bp']) {
        const [r] =
          await db`select has_column_privilege(${role},'public.registration_links',${c},'SELECT') as allowed`;
        expect(r!.allowed).toBe(false);
      }
  });
  it('grants no table-level SELECT on either F10 base table', async () => {
    for (const table of [
      'registration_links',
      'registration_link_installments',
    ]) {
      const [grant] =
        await db`select has_table_privilege('authenticated',${'public.' + table},'SELECT') as allowed`;
      expect(grant!.allowed).toBe(false);
    }
  });
  it('grants authenticated exactly the safe F10 base columns', async () => {
    const safeColumns: Record<string, readonly string[]> = {
      registration_links: [
        'workspace_id',
        'id',
        'package_version_id',
        'created_by',
        'created_at',
        'expires_at',
        'opened_at',
        'consumed_at',
        'price_minor',
        'currency',
        'duration_days',
        'duration_months',
      ],
      registration_link_installments: [
        'workspace_id',
        'link_id',
        'seq',
        'amount_minor',
        'due_offset_days',
      ],
    };
    for (const [table, safe] of Object.entries(safeColumns)) {
      const columns =
        await db`select column_name from information_schema.columns where table_schema='public' and table_name=${table} order by ordinal_position`;
      const explicit =
        await db`select column_name from information_schema.column_privileges where grantee='authenticated' and table_schema='public' and table_name=${table} and privilege_type='SELECT'`;
      expect(explicit.map((r) => r.column_name).sort()).toEqual(
        [...safe].sort(),
      );
      for (const column of columns) {
        const [grant] =
          await db`select has_column_privilege('authenticated',${'public.' + table},${column.column_name},'SELECT') as allowed`;
        expect(grant!.allowed).toBe(safe.includes(column.column_name));
      }
    }
    for (const column of ['token_hash', 'commission_rate_bp']) {
      const [grant] =
        await db`select has_column_privilege('authenticated','public.registration_links',${column},'SELECT') as allowed`;
      expect(grant!.allowed).toBe(false);
    }
  });
  it('hardens complete F10 function inventory and pgcrypto schema/vector', async () => {
    const signatures = [
      ...registrationPrivate
        .filter(
          (name) =>
            !name.startsWith('f13_') &&
            !name.startsWith('f15_') &&
            !name.startsWith('write_f15_') &&
            !name.startsWith('consume_f15_'),
        )
        .map(
          (n) =>
            'app_private.' +
            n +
            (n === 'registration_link_is_valid'
              ? '(timestamptz,timestamptz,timestamptz,timestamptz)'
              : n === 'validate_registration_link_schedule'
                ? '(uuid,uuid)'
                : '()'),
        ),
      'app_private.cancel_f15_client_alerts(uuid,uuid)',
      'app_private.enforce_form_revision_snapshot_keys()',
      'app_private.enforce_n08_budget_answer_consistency()',
      'app_private.f15_cancel_client_alerts_after_relationship_end()',
      'app_private.f15_client_alert_lifecycle_active(uuid,uuid)',
      ...(existsSync(
        'supabase/migrations/20261112031000_f15_signup_main_reconciliation.sql',
      )
        ? ['app_private.f15_valid_slider_label(jsonb)']
        : []),
      'public.issue_registration_link(uuid,uuid,text,jsonb)',
      'public.registration_link_open(text)',
      'public.get_registration_link_commissions(uuid)',
      'app_private.f13_audit_freeze()',
      'app_private.f13_audit_renewal()',
      'app_private.f13_audit_renewal_date_revision()',
      'app_private.f13_audit_refund_ledger()',
      'app_private.f13_check_freeze()',
      'app_private.f13_check_refund_ledger()',
      'app_private.f13_freeze_contribution(uuid,uuid,uuid)',
      'app_private.f13_freeze_event_guard()',
      'app_private.f13_freeze_guard()',
      'app_private.f13_reflow_unstarted_renewal()',
      'app_private.f13_guard_terminal_payment()',
      'app_private.f13_validate_freeze(uuid,uuid)',
      'app_private.f13_validate_renewal(uuid,uuid)',
      'app_private.f13_validate_refund_ledger(uuid,uuid)',
      'app_private.f15_alert_occurrence_authorize_insert()',
      'app_private.f15_alert_recipient_authorized(uuid,uuid,text)',
      'app_private.f15_alert_schedule_audit()',
      'app_private.f15_alert_schedule_immutable()',
      'app_private.f15_alert_schedule_run()',
      'app_private.f15_alert_schedule_activate()',
      'app_private.f15_alert_schedule_deactivate()',
      'app_private.f15_client_alert_schedule_insert()',
      'app_private.write_f15_in_app_alert(uuid)',
      'app_private.f15_alert_inbox_after_occurrence()',
      'app_private.consume_f15_telegram_start(bigint,text,text)',
      'app_private.register_f15_trainer_alert_schedule(uuid,uuid,uuid,timestamptz)',
      'app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer)',
      'public.read_form_alert_inbox(integer,timestamptz)',
      'public.mark_form_alert_read(uuid)',
      'public.prepare_f15_telegram_delivery(uuid,uuid)',
      'public.claim_f15_telegram_delivery(uuid)',
      'public.claim_f15_form_alert_jobs(integer,integer)',
      'public.consume_f15_telegram_start(bigint,text,text)',
      'public.finish_f15_telegram_delivery(uuid,text)',
      'public.record_renewal(jsonb)',
    ];
    for (const name of signatures) {
      const [r] =
        await db`select pg_get_userbyid(proowner) as owner,proconfig from pg_proc where oid=${name}::regprocedure`;
      expect(r!.owner).toBe(
        name === 'public.registration_link_open(text)'
          ? 'branding_definer'
          : 'postgres',
      );
      expect(r!.proconfig).toContain('search_path=""');
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const [g] =
          await db`select has_function_privilege(${role},${name},'EXECUTE') as allowed`;
        expect(g!.allowed, `${role} ${name}`).toBe(
          name.startsWith('public.') &&
            ((role === 'authenticated' &&
              !name.includes('prepare_f15_telegram_delivery') &&
              !name.includes('claim_f15_telegram_delivery') &&
              !name.includes('claim_f15_form_alert_jobs') &&
              !name.includes('consume_f15_telegram_start') &&
              !name.includes('finish_f15_telegram_delivery')) ||
              (role === 'anon' && name.includes('registration_link_open')) ||
              (role === 'service_role' &&
                (name.includes('prepare_f15_telegram_delivery') ||
                  name.includes('claim_f15_telegram_delivery') ||
                  name.includes('claim_f15_form_alert_jobs') ||
                  name.includes('consume_f15_telegram_start') ||
                  name.includes('finish_f15_telegram_delivery')))),
        );
      }
    }
    const [r] =
      await db`select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where extname='pgcrypto'`;
    expect(r!.nspname).toBe('extensions');
    const [v] =
      await db`select encode(extensions.digest('abc','sha256'),'hex') as hash`;
    expect(v!.hash).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const fks =
      await db`select pg_get_constraintdef(oid) as definition from pg_constraint where contype='f' and conrelid in ('public.registration_links'::regclass,'public.registration_link_installments'::regclass)`;
    expect(fks.map((f) => f.definition)).toContain(
      'FOREIGN KEY (workspace_id, package_version_id) REFERENCES package_versions(workspace_id, id) ON DELETE RESTRICT',
    );
    expect(fks.map((f) => f.definition)).toContain(
      'FOREIGN KEY (workspace_id, link_id) REFERENCES registration_links(workspace_id, id) ON DELETE RESTRICT',
    );
  });
  it('attaches the complete enabled F10 trigger inventory', async () => {
    const rows =
      await db`select t.tgname,c.relname,t.tgtype::int as type,t.tgenabled,t.tgdeferrable,t.tginitdeferred,p.proname from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_proc p on p.oid=t.tgfoid where c.oid in ('public.registration_links'::regclass,'public.registration_link_installments'::regclass) and not t.tgisinternal order by c.relname desc,t.tgname`;
    expect(rows).toEqual([
      {
        tgname: 'audit_registration_links_issued',
        relname: 'registration_links',
        type: 5,
        tgenabled: 'O',
        tgdeferrable: true,
        tginitdeferred: true,
        proname: 'audit_row_change',
      },
      {
        tgname: 'audit_registration_links_opened',
        relname: 'registration_links',
        type: 17,
        tgenabled: 'O',
        tgdeferrable: false,
        tginitdeferred: false,
        proname: 'audit_row_change',
      },
      {
        tgname: 'registration_links_insert_guard',
        relname: 'registration_links',
        type: 7,
        tgenabled: 'O',
        tgdeferrable: false,
        tginitdeferred: false,
        proname: 'guard_registration_link_insert',
      },
      {
        tgname: 'registration_links_no_delete',
        relname: 'registration_links',
        type: 11,
        tgenabled: 'O',
        tgdeferrable: false,
        tginitdeferred: false,
        proname: 'forbid_delete',
      },
      {
        tgname: 'registration_links_no_truncate',
        relname: 'registration_links',
        type: 34,
        tgenabled: 'O',
        tgdeferrable: false,
        tginitdeferred: false,
        proname: 'forbid_delete',
      },
      {
        tgname: 'registration_links_schedule',
        relname: 'registration_links',
        type: 5,
        tgenabled: 'O',
        tgdeferrable: true,
        tginitdeferred: true,
        proname: 'check_registration_link_schedule',
      },
      {
        tgname: 'registration_links_update_guard',
        relname: 'registration_links',
        type: 19,
        tgenabled: 'O',
        tgdeferrable: false,
        tginitdeferred: false,
        proname: 'guard_registration_link_update',
      },
      {
        tgname: 'registration_installments_insert_guard',
        relname: 'registration_link_installments',
        type: 7,
        tgenabled: 'O',
        tgdeferrable: false,
        tginitdeferred: false,
        proname: 'guard_registration_installment_insert',
      },
      {
        tgname: 'registration_installments_schedule',
        relname: 'registration_link_installments',
        type: 5,
        tgenabled: 'O',
        tgdeferrable: true,
        tginitdeferred: true,
        proname: 'check_registration_link_schedule',
      },
      {
        tgname: 'registration_link_installments_no_delete',
        relname: 'registration_link_installments',
        type: 11,
        tgenabled: 'O',
        tgdeferrable: false,
        tginitdeferred: false,
        proname: 'forbid_delete',
      },
      {
        tgname: 'registration_link_installments_no_truncate',
        relname: 'registration_link_installments',
        type: 34,
        tgenabled: 'O',
        tgdeferrable: false,
        tginitdeferred: false,
        proname: 'forbid_delete',
      },
      {
        tgname: 'registration_link_installments_no_update',
        relname: 'registration_link_installments',
        type: 19,
        tgenabled: 'O',
        tgdeferrable: false,
        tginitdeferred: false,
        proname: 'audit_events_immutable',
      },
    ]);
  });
  it('has the complete composite FK inventory', async () => {
    const fks =
      await db`select pg_get_constraintdef(oid) as definition from pg_constraint where contype='f' and conrelid in ('public.registration_links'::regclass,'public.registration_link_installments'::regclass) order by definition`;
    expect(fks.map((f) => f.definition).sort()).toEqual(
      [
        'FOREIGN KEY (created_by) REFERENCES staff_profiles(user_id) ON DELETE RESTRICT',
        'FOREIGN KEY (workspace_id, link_id) REFERENCES registration_links(workspace_id, id) ON DELETE RESTRICT',
        'FOREIGN KEY (workspace_id, package_version_id) REFERENCES package_versions(workspace_id, id) ON DELETE RESTRICT',
        'FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT',
      ].sort(),
    );
  });
  it('security_invoker views return only RLS-scoped rows to non-owner roles', async () => {
    const fixture = await registrationFixture(),
      linkId = checked(await issue(fixture, fixture.salesA.client));
    for (const [name, expected] of [
      ['po', 1],
      ['woA', 1],
      ['salesA', 1],
      ['trainerA', 1],
      ['woB', 0],
      ['salesB', 0],
      ['trainerB', 0],
      ['revoked', 0],
      ['noProfile', 0],
      ['client', 0],
    ] as const)
      await db.begin(async (tx) => {
        await tx`select set_config('role','authenticated',true)`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.actors[name].userId, role: 'authenticated' })},true)`;
        const rows =
          await tx`select id from public.registration_links_safe where workspace_id=${fixture.wsA.id}`;
        expect(rows).toHaveLength(expected);
        if (expected) expect(rows[0]!.id).toBe(linkId);
      });
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('role','anon',true)`;
        await tx`select id from public.registration_links_safe`;
      }),
    ).rejects.toMatchObject({ code: '42501' });
    const [view] =
      await db`select pg_get_userbyid(relowner) as owner,reloptions from pg_class where oid='public.registration_links_safe'::regclass`;
    expect(view!.owner).toBe('postgres');
    expect(view!.reloptions).toContain('security_invoker=true');
  });
});
