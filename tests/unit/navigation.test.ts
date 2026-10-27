import { describe, expect, it } from 'vitest';
import { getNavigation } from '../../lib/design/navigation';

describe('navigation', () => {
  it('defines the exact trainer order, labels, and icons', () => {
    expect(getNavigation('trainer')).toEqual({
      status: 'defined',
      items: [
        { key: 'home', labelKey: 'nav.home', icon: 'home' },
        { key: 'clients', labelKey: 'nav.clients', icon: 'users' },
        { key: 'workout', labelKey: 'nav.workout', icon: 'dumbbell' },
        { key: 'nutrition', labelKey: 'nav.nutrition', icon: 'utensils' },
        { key: 'more', labelKey: 'nav.more', icon: 'more' },
      ],
    });
  });
  it('defines the exact client order, labels, and icons', () => {
    expect(getNavigation('client')).toEqual({
      status: 'defined',
      items: [
        { key: 'home', labelKey: 'nav.home', icon: 'home' },
        { key: 'workout', labelKey: 'nav.workout', icon: 'dumbbell' },
        { key: 'nutrition', labelKey: 'nav.nutrition', icon: 'utensils' },
        { key: 'progress', labelKey: 'nav.progress', icon: 'chart' },
        { key: 'more', labelKey: 'nav.more', icon: 'more' },
      ],
    });
  });
  it.each(['platform_owner', 'workspace_owner', 'sales'] as const)(
    'leaves %s navigation awaiting a decision',
    (role) => {
      expect(getNavigation(role)).toEqual({ status: 'needs-decision', role });
    },
  );
});
