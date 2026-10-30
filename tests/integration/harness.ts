import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import type { Role } from '../../lib/auth/capabilities';
import {
  assertLocalStackTarget,
  loadSelectedStackEnv,
  selectStack,
} from '../../scripts/local-stack.mjs';

export function loadEnv() {
  const stack = selectStack(process.env);
  if (stack !== 'c') loadSelectedStackEnv();
  const apiUrl = process.env.API_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey =
    process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.DB_URL || process.env.SUPABASE_DB_URL;
  const hasCompleteEnvironment = Boolean(
    apiUrl && anonKey && serviceRoleKey && dbUrl,
  );
  if (stack === 'c' && !hasCompleteEnvironment)
    throw new Error(
      'Integration env missing: inject Stack C status environment',
    );
  if (!apiUrl || !anonKey || !serviceRoleKey || !dbUrl) {
    throw new Error(
      'Integration env missing: run `supabase start` and export `supabase status -o env`',
    );
  }
  if (stack === 'c') assertLocalStackTarget({ stack, apiUrl, dbUrl });
  return { apiUrl, anonKey, serviceRoleKey, dbUrl };
}

// Fail before opening any sockets when the local stack environment is missing.
const env = loadEnv();
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

export function admin(): SupabaseClient {
  return createClient(env.apiUrl, env.serviceRoleKey, options);
}

export function anonClient(): SupabaseClient {
  return createClient(env.apiUrl, env.anonKey, options);
}

export function sql(): postgres.Sql {
  return postgres(env.dbUrl, { max: 1, connect_timeout: 10 });
}

export function checked<T>(result: {
  data: T;
  error: { message: string } | null;
}): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function createStaff(role: Role | null, label: string) {
  const email = `f3+${label}-${randomUUID()}@example.test`;
  const password = `F3-${randomUUID()}-aA1!`;
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw new Error(created.error.message);
  const { user } = created.data;
  if (!user) throw new Error('Staff fixture auth user missing');
  if (role !== null)
    checked(
      await admin().from('staff_profiles').insert({ user_id: user.id, role }),
    );
  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(signedIn.error.message);
  return { userId: user.id, email, client };
}

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  created_by: string;
};

export async function twoWorkspaceFixture() {
  const po = await createStaff('platform_owner', 'po');
  const woA = await createStaff('workspace_owner', 'wo-a');
  const trainerA = await createStaff('trainer', 'trainer-a');
  const salesA = await createStaff('sales', 'sales-a');
  const trainerB = await createStaff('trainer', 'trainer-b');
  const makeWorkspace = async (label: string): Promise<Workspace> =>
    checked(
      await admin()
        .from('workspaces')
        .insert({
          name: `Fixture ${label}`,
          slug: `f3-${label}-${randomUUID()}`,
          created_by: po.userId,
        })
        .select()
        .single(),
    ) as Workspace;
  const wsA = await makeWorkspace('a');
  const wsB = await makeWorkspace('b');
  checked(
    await admin()
      .from('workspace_memberships')
      .insert([
        ...[woA, trainerA, salesA].map((staff) => ({
          workspace_id: wsA.id,
          user_id: staff.userId,
          granted_by: po.userId,
        })),
        {
          workspace_id: wsB.id,
          user_id: trainerB.userId,
          granted_by: po.userId,
        },
      ]),
  );
  return {
    wsA,
    wsB,
    po,
    woA,
    trainerA,
    salesA,
    trainerB,
    cleanupNote:
      'Synthetic fixtures remain in the disposable local stack; supabase stop --no-backup removes them.',
  };
}
