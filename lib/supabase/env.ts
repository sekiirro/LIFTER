export function isSecureUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

export function readServerEnv() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appOrigin = process.env.APP_ORIGIN;
  if (
    !url ||
    !anonKey ||
    !serviceRoleKey ||
    !appOrigin ||
    !isSecureUrl(url) ||
    !isSecureUrl(appOrigin)
  )
    return null;
  return { url, anonKey, serviceRoleKey, appOrigin };
}
