import type { Locale } from '../design/preferences';
import { ar } from './messages/ar';
import { en } from './messages/en';

export type MessageKey = keyof typeof ar;
export type Messages = Record<MessageKey, string>;
export function getMessages(locale: Locale): Messages {
  return locale === 'en' ? en : ar;
}
