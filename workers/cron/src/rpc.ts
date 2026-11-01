import type { Rpc } from './drain';

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export function validateSupabaseUrl(supabaseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(supabaseUrl);
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
  return url;
}

export function createRpc(
  env: Env,
  fetcher: typeof fetch = fetch,
  timeoutSignal: (milliseconds: number) => AbortSignal = AbortSignal.timeout,
): Rpc {
  validateSupabaseUrl(env.SUPABASE_URL);

  return async (name, args) => {
    const signal = timeoutSignal(30_000);
    let response: Response;
    try {
      response = await fetcher(
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
          signal,
        },
      );
    } catch {
      if (signal.aborted) throw new Error('rpc_timeout');
      throw new Error('rpc_fetch_failed');
    }
    // Never include response bodies, payloads or credentials in error messages.
    if (!response.ok) throw new Error(`rpc_http_${response.status}`);
    return response.json();
  };
}
