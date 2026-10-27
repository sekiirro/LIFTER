import type { Rpc } from './drain';

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export function createRpc(env: Env): Rpc {
  return async (name, args) => {
    const response = await fetch(
      `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${name}`,
      {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      },
    );
    // Never include response bodies, payloads or credentials in error messages.
    if (!response.ok) throw new Error(`rpc_http_${response.status}`);
    return response.json();
  };
}
