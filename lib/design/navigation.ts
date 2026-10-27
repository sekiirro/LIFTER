import type { IconName } from '../../components/icons/Icon';
import type { MessageKey } from '../i18n';

export type Role =
  'platform_owner' | 'workspace_owner' | 'trainer' | 'sales' | 'client';
export type NavKey =
  'home' | 'clients' | 'workout' | 'nutrition' | 'progress' | 'more';
export type NavItem = {
  key: NavKey;
  labelKey: Extract<MessageKey, `nav.${NavKey}`>;
  icon: IconName;
};
export type NavigationResult =
  | { status: 'defined'; items: readonly NavItem[] }
  | { status: 'needs-decision'; role: Role };

export const NAV_CONFIG = {
  trainer: [
    { key: 'home', labelKey: 'nav.home', icon: 'home' },
    { key: 'clients', labelKey: 'nav.clients', icon: 'users' },
    { key: 'workout', labelKey: 'nav.workout', icon: 'dumbbell' },
    { key: 'nutrition', labelKey: 'nav.nutrition', icon: 'utensils' },
    { key: 'more', labelKey: 'nav.more', icon: 'more' },
  ],
  client: [
    { key: 'home', labelKey: 'nav.home', icon: 'home' },
    { key: 'workout', labelKey: 'nav.workout', icon: 'dumbbell' },
    { key: 'nutrition', labelKey: 'nav.nutrition', icon: 'utensils' },
    { key: 'progress', labelKey: 'nav.progress', icon: 'chart' },
    { key: 'more', labelKey: 'nav.more', icon: 'more' },
  ],
} as const satisfies Record<'trainer' | 'client', readonly NavItem[]>;

export function getNavigation(role: Role): NavigationResult {
  if (role === 'trainer' || role === 'client')
    return { status: 'defined', items: NAV_CONFIG[role] };
  return { status: 'needs-decision', role };
}
