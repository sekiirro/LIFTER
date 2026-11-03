import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    default: ({ children, ...props }: React.ComponentProps<'a'>) =>
      React.createElement('a', { ...props, 'data-next-link': '' }, children),
  };
});

import { NavRail } from '../../components/shell/NavRail';
import { BottomBar } from '../../components/shell/BottomBar';
import { getNavigation } from '../../lib/design/navigation';
import { getMessages } from '../../lib/i18n';

describe('desktop Glisse dock destinations', () => {
  it.each(['trainer', 'client'] as const)(
    'keeps %s direct destinations and omits the mobile More entry',
    (role) => {
      const navigation = getNavigation(role);
      if (navigation.status !== 'defined') throw new Error('Expected role nav');
      const html = renderToStaticMarkup(
        <NavRail
          items={navigation.items}
          activeKey="home"
          messages={getMessages('en')}
        />,
      );
      expect(html).not.toContain('data-nav-key="more"');
      expect(html.match(/data-nav-key=/g)).toHaveLength(4);
    },
  );

  it('renders internal rail and bottom navigation through Next Link', () => {
    const navigation = getNavigation('trainer');
    if (navigation.status !== 'defined') throw new Error('Expected role nav');
    const props = {
      items: navigation.items,
      activeKey: 'home' as const,
      hrefFor: (key: string) => `/${key}?from=shell#top`,
      messages: getMessages('en'),
    };

    for (const html of [
      renderToStaticMarkup(<NavRail {...props} />),
      renderToStaticMarkup(<BottomBar {...props} />),
    ]) {
      expect(html).toContain('data-next-link=""');
      expect(html).toContain('href="/home?from=shell#top"');
      expect(html).toContain('aria-current="page"');
    }
  });
});
