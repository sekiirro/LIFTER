import { getMessages, type MessageKey } from '../i18n';
import type { Locale } from '../design/preferences';

const n11FeedbackBands = [
  { min: 0, max: 2, key: 'forms.intake.n11.feedback.0_2' },
  { min: 3, max: 4, key: 'forms.intake.n11.feedback.3_4' },
  { min: 5, max: 6, key: 'forms.intake.n11.feedback.5_6' },
  { min: 7, max: 8, key: 'forms.intake.n11.feedback.7_8' },
  { min: 9, max: 10, key: 'forms.intake.n11.feedback.9_10' },
] as const satisfies readonly {
  min: number;
  max: number;
  key: MessageKey;
}[];

export function getN11Feedback(score: number, locale: Locale): string | null {
  if (!Number.isInteger(score)) return null;
  const band = n11FeedbackBands.find(
    ({ min, max }) => score >= min && score <= max,
  );
  return band ? getMessages(locale)[band.key] : null;
}
