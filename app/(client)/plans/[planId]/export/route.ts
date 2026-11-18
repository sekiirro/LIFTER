import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { getActor } from '../../../../../lib/auth/actor';
import {
  exportClientNutritionPlan,
  parseExportFormat,
} from '../../../../../lib/client-access/plan-export';
import {
  isUuid,
  parseRevisionParam,
} from '../../../../../lib/client-access/portal-projection';
import {
  LOCALE_COOKIE,
  parseLocale,
} from '../../../../../lib/design/preferences';
import { createSessionClient } from '../../../../../lib/supabase/server';

/**
 * F22 US4: a client downloads the selected published revision of an own
 * delivered nutrition plan. The client, workspace and F13 entitlement are
 * derived by the database wall on every request. Any denial redirects to the
 * plan page with the approved "cannot be exported" notice; that page applies
 * its own wall, so a foreign or unknown plan id still answers 404 there.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ planId: string }> },
) {
  const { planId } = await context.params;
  const format = parseExportFormat(request.nextUrl.searchParams.get('format'));
  const revisionValue = request.nextUrl.searchParams.get('revision');
  const revision = parseRevisionParam(revisionValue ?? undefined);
  if (!isUuid(planId) || !format || revision === 'invalid')
    return new NextResponse(null, { status: 404 });
  const actor = await getActor();
  if (!actor || actor.role !== null)
    return new NextResponse(null, { status: 404 });
  const client = await createSessionClient();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const result = client
    ? await exportClientNutritionPlan(client, {
        planId,
        revisionNumber: revision,
        format,
        locale,
      })
    : ({ status: 'denied' } as const);
  if (result.status !== 'ok') {
    const target = new URL(`/plans/${planId}`, request.url);
    target.searchParams.set('export', 'unavailable');
    return NextResponse.redirect(target, 303);
  }
  const body: BodyInit =
    typeof result.body === 'string'
      ? result.body
      : (result.body.buffer.slice(
          result.body.byteOffset,
          result.body.byteOffset + result.body.byteLength,
        ) as ArrayBuffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      'Content-Disposition':
        result.format === 'excel'
          ? `attachment; filename="${result.filename}"`
          : `inline; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // The F18 print document is static HTML + inline CSS: no scripts, frames
      // or network are ever needed to render it.
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      Vary: 'Cookie',
    },
  });
}
