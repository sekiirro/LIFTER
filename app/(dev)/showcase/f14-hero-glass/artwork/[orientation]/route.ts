import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isShowcaseEnabled } from '../../../../../../lib/design/showcase';

export const runtime = 'nodejs';

const artworkFiles = {
  desktop: 'desktop.webp',
  mobile: 'mobile.webp',
} as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ orientation: string }> },
) {
  if (!isShowcaseEnabled(process.env) || process.env.NODE_ENV === 'production')
    return new Response(null, { status: 404 });

  const { orientation } = await context.params;
  if (orientation !== 'desktop' && orientation !== 'mobile')
    return new Response(null, { status: 404 });

  const bytes = await readFile(
    join(
      process.cwd(),
      'tests',
      'fixtures',
      'f14-hero-generated',
      artworkFiles[orientation],
    ),
  );

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Length': String(bytes.byteLength),
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
