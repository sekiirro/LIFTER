export function normalizeRoute(method, url) {
  const pathname = new URL(url, 'https://route.invalid').pathname;
  const route = pathname
    .split('/')
    .map((segment) =>
      /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(
        segment,
      )
        ? ':id'
        : segment,
    )
    .join('/');
  const verb = String(method).toUpperCase();
  return `${/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|CONNECT|TRACE)$/.test(verb) ? verb : 'OTHER'} ${route}`;
}

export function assertSafeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid base URL');
  }
  if (
    url.username ||
    url.password ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  )
    throw new Error('Unsafe base URL');
  return url;
}
