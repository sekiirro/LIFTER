import { afterEach, expect, it } from 'vitest';
import { createPublishedBannerFixture } from './branding-banner-fixture';

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

it('creates, validates, attaches, and publishes the loaded-image banner through the approved pipeline', async () => {
  const fixture = await createPublishedBannerFixture();
  cleanup = fixture.cleanup;
  expect(fixture.processed).toMatchObject({
    width: 316,
    height: 158,
    mediaType: 'image/png',
  });
  const opened = await fixture.actors.anon.client.rpc(
    'registration_link_open',
    {
      token: fixture.token,
    },
  );
  expect(opened.error).toBeNull();
  expect(opened.data?.branding?.banner).toBe(true);
  expect(opened.data?.render_handle).toBeTruthy();
});
