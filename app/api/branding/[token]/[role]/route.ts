import {
  downloadBrandingAsset,
  resolveBrandingAsset,
} from '../../../../../lib/branding/public-read';
import { createBrandingProxyResponse } from '../../../../../lib/branding/proxy-response';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = { params: Promise<{ token: string; role: string }> };

async function respond(request: Request, context: RouteContext) {
  const { token, role } = await context.params;
  const url = new URL(request.url);
  const handles = url.searchParams.getAll('handle');
  const handle =
    url.searchParams.size === 1 && handles.length === 1
      ? (handles[0] ?? null)
      : null;
  return createBrandingProxyResponse(
    request,
    { token, slot: role, handle },
    { resolve: resolveBrandingAsset, download: downloadBrandingAsset },
  );
}

export function GET(request: Request, context: RouteContext) {
  return respond(request, context);
}

export function HEAD(request: Request, context: RouteContext) {
  return respond(request, context);
}

export function POST(request: Request, context: RouteContext) {
  return respond(request, context);
}

export function PUT(request: Request, context: RouteContext) {
  return respond(request, context);
}

export function PATCH(request: Request, context: RouteContext) {
  return respond(request, context);
}

export function DELETE(request: Request, context: RouteContext) {
  return respond(request, context);
}

export function OPTIONS(request: Request, context: RouteContext) {
  return respond(request, context);
}
