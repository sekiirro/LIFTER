import { afterAll, describe, expect, it } from 'vitest';
import { sql } from './harness';

const db = sql();
afterAll(async () => db.end());

describe('catalog Video host policy', () => {
  it.each([
    'http://youtube.com/watch?v=abcdefghijk',
    'https://youtube.com.evil.example/watch?v=abcdefghijk',
    'https://user:password@youtube.com/watch?v=abcdefghijk',
    'https://vimeo.com/123456789',
    'https://docs.google.com/document/d/abcdefghijk',
  ])('rejects disallowed video URL %s', async (videoUrl) => {
    await expect(
      db`select app_private.catalog_video_url_allowed(${videoUrl}) as allowed`,
    ).resolves.toEqual([{ allowed: false }]);
  });
});
