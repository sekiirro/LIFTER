import { describe, expect, it } from 'vitest';
import {
  getActiveNavigationKey,
  getShellNavigationHref,
} from '../../components/shell/ShellNavigation';

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

  it('keeps trainer Clients routing aligned with the active Registration Links route', () => {
    expect(getActiveNavigationKey('/registration-links')).toBe('clients');
    expect(
      getShellNavigationHref('clients', '/registration-links', 'trainer'),
    ).toBe('/registration-links');
    expect(
      getShellNavigationHref(
        'clients',
        '/registration-links',
        'trainer',
        'workspace id',
      ),
    ).toBe('/registration-links?workspace=workspace%20id');
    expect(getShellNavigationHref('clients', '/', 'client')).toBe('/#clients');
  });
});
