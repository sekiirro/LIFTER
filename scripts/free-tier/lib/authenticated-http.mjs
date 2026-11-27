export function roleForRoute(pathname) {
  if (
    pathname === '/clients' ||
    pathname === '/workspaces' ||
    pathname === '/reports'
  )
    return 'po';
  if (pathname === '/welcome') return 'client';
  return null;
}

export function cookieHeaderForRoute(pathname, cookiesByRole) {
  const role = roleForRoute(pathname);
  if (role === null) return undefined;
  const cookie = cookiesByRole?.[role];
  if (typeof cookie !== 'string' || cookie.trim() === '')
    throw new Error(`Missing synthetic ${role} session for ${pathname}`);
  return cookie;
}

export function requestWithSyntheticCookies(cookiesByRole, request = fetch) {
  return (target, init) => {
    const cookie = cookieHeaderForRoute(target.pathname, cookiesByRole);
    const headers = new Headers(init.headers);
    if (cookie) headers.set('cookie', cookie);
    return request(target, { ...init, headers });
  };
}

export class NonSuccessfulHttpResponsesError extends Error {
  constructor(report) {
    const failed = (
      Array.isArray(report?.http_routes) ? report.http_routes : []
    )
      .filter(
        (row) =>
          !Array.isArray(row.status_samples) ||
          row.status_samples.length !== row.count ||
          row.status_samples.some((status) => status !== 200),
      )
      .map((row) => {
        const samples = Array.isArray(row.status_samples)
          ? row.status_samples.join(',')
          : 'missing';
        return `${row.route ?? 'unknown route'}=${samples}`;
      });
    super(
      `HTTP baseline requires status 200 for every sample: ${failed.join('; ')}`,
    );
    this.name = 'NonSuccessfulHttpResponsesError';
    this.report = report;
  }
}

export function assertAllHttpSamplesAre200(report) {
  if (
    !Array.isArray(report?.http_routes) ||
    report.http_routes.some(
      (row) =>
        !Array.isArray(row.status_samples) ||
        row.status_samples.length !== row.count ||
        row.status_samples.some((status) => status !== 200),
    )
  )
    throw new NonSuccessfulHttpResponsesError(report);
}
