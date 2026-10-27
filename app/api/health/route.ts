import { buildHealth } from '../../../lib/health';

export function GET() {
  return Response.json(buildHealth(process.env.APP_VERSION ?? '0.0.0'), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
