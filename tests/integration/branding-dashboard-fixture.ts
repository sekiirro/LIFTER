import { randomUUID } from 'node:crypto';
import { admin, anonClient, checked, sql } from './harness';
import { testStaffDisplayName } from '../helpers/staff-display-name';

async function createWorkspaceOwner(label: string, workspaceCount: number) {
  const email = `f14-dashboard-${label}-${randomUUID()}@example.test`;
  const password = `F14!${randomUUID()}aA9`;
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error('Dashboard owner fixture creation failed');
  const userId = created.data.user.id;
  checked(
    await admin().from('staff_profiles').insert({
      user_id: userId,
      role: 'workspace_owner',
      display_name: testStaffDisplayName(),
    }),
  );
  const workspaces = [];
  for (let index = 0; index < workspaceCount; index += 1) {
    const workspace = checked(
      await admin()
        .from('workspaces')
        .insert({
          name: `F14 ${label} ${index + 1}`,
          slug: `f14-${label}-${randomUUID()}`,
          created_by: userId,
        })
        .select('id,name')
        .single(),
    );
    workspaces.push(workspace as { id: string; name: string });
  }
  checked(
    await admin()
      .from('workspace_memberships')
      .insert(
        workspaces.map((workspace) => ({
          workspace_id: workspace.id,
          user_id: userId,
          granted_by: userId,
        })),
      ),
  );
  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session)
    throw new Error('Dashboard owner sign-in failed');
  for (const [index, workspace] of workspaces.entries()) {
    const revision = checked(
      await client.rpc('branding_draft_save', {
        workspace_id: workspace.id,
        expected_revision: 0,
        fields: {
          name: { ar: `المسودة ${index + 1}`, en: `Draft ${index + 1}` },
          color: index === 0 ? '#2563EB' : '#FF00FF',
        },
      }),
    ) as number;
    checked(
      await client.rpc('branding_publish', {
        workspace_id: workspace.id,
        expected_revision: revision,
      }),
    );
  }
  return { email, password, session: signedIn.data.session, workspaces };
}

export async function createBrandingDashboardFixtures() {
  const editor = await createWorkspaceOwner('editor', 2);
  const staff = await createWorkspaceOwner('staff', 1);
  return {
    editor,
    staff,
    close: async () => await sql().end(),
  };
}
