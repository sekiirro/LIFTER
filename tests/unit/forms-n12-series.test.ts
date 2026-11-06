import { describe, expect, it } from 'vitest';

import { resolveN12ImageSeries } from '../../lib/forms/progression';

describe('S14 N12 image series mapping', () => {
  it('maps the approved sex answer to its image series', () => {
    expect(resolveN12ImageSeries('male')).toBe('male');
    expect(resolveN12ImageSeries('female')).toBe('female');
  });

  it('fails closed for unsupported values and never selects male-cinematic', () => {
    expect(resolveN12ImageSeries('male-cinematic')).toBeNull();
    expect(resolveN12ImageSeries('other')).toBeNull();
    expect(resolveN12ImageSeries(undefined)).toBeNull();
  });
});
