import type { Rpc } from './drain';

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export function createRpc(env: Env): Rpc {
  let url: URL;
  try {
    url = new URL(env.SUPABASE_URL);
  } catch {
    throw new Error('rpc_insecure_url');
  }
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
  ) {
    throw new Error('rpc_insecure_url');
  }

  return async (name, args) => {
    const response = await fetch(
      `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${name}`,
      {
        method: 'POST',
        redirect: 'manual',
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
