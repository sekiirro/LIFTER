'use server';

import { createSessionClient } from '../../lib/supabase/server';

export async function signOut() {
  try {
    const client = await createSessionClient();
    if (!client) return false;
    const { error } = await client.auth.signOut({ scope: 'local' });
    return error === null;
  } catch {
    // Preserve the current session and client recovery state on failure.
    return false;
  }
}
