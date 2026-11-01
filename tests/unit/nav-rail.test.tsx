import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NavRail } from '../../components/shell/NavRail';
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
});
