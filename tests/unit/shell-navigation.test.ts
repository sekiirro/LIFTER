import { describe, expect, it } from 'vitest';
import { getActiveNavigationKey } from '../../components/shell/ShellNavigation';

describe('ShellNavigation active route mapping', () => {
  it.each([
    ['/', 'home'],
    ['/showcase/shell', 'home'],
    ['/registration-links', 'clients'],
    ['/registration-links/anything', 'clients'],
    ['/registration-links/nested/route', 'clients'],
    ['/registration-linksX', undefined],
    ['/packages', undefined],
    ['/showcase/shell/anything', undefined],
    ['/not-a-navigation-route', undefined],
  ])('maps %s to %s', (pathname, expected) => {
    expect(getActiveNavigationKey(pathname)).toBe(expected);
  });
});
