'use server';

import { redirect } from 'next/navigation';
import { createSessionClient } from '../../lib/supabase/server';

export async function signOut() {
  try {
    const client = await createSessionClient();
    if (client) await client.auth.signOut({ scope: 'local' });
  } catch {
    // Do not expose provider failures through a server-action exception.
  }
  redirect('/login');
}
