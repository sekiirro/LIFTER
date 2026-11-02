import { getMessages } from '../../lib/i18n';
import type { Locale } from '../../lib/design/preferences';
import { Bidi } from '../ui/Bidi';
import { formatUiNumber, localizeUiDigits } from '../../lib/i18n/format-digits';
import styles from './QuestionFlow.module.css';

export type AnswerHistoryEntry = {
  version: number;
  createdAt?: string;
  answers: Readonly<
    Record<string, string | number | boolean | readonly string[]>
  >;
};

export function CorrectionHistory({
  locale,
  entries,
}: {
  locale: Locale;
  entries: readonly AnswerHistoryEntry[];
}) {
  const messages = getMessages(locale);
  return (
    <section className={styles.history} aria-labelledby="history-heading">
      <h2 id="history-heading">{messages['forms.historyTitle']}</h2>
      {entries.length === 0 ? (
        <p>{messages['forms.historyEmpty']}</p>
      ) : (
        <ol>
          {entries.map((entry) => (
            <li key={`${entry.version}-${entry.createdAt ?? 'revision'}`}>
              <h3>
                {messages['forms.version']
                  .split('{version}')
                  .map((part, index) => (
                    <span key={index}>
                      {part}
                      {index === 0 && (
                        <Bidi dir="ltr">
                          {formatUiNumber(entry.version, locale)}
                        </Bidi>
                      )}
                    </span>
                  ))}
              </h3>
              {entry.createdAt && (
                <time dateTime={entry.createdAt}>
                  <Bidi dir="ltr">{entry.createdAt}</Bidi>
                </time>
              )}
              <dl>
                {Object.entries(entry.answers).map(([questionId, answer]) => (
                  <div key={questionId}>
                    <dt>
                      <Bidi dir="ltr">{questionId}</Bidi>
                    </dt>
                    <dd>
                      {Array.isArray(answer)
                        ? answer.join(', ')
                        : typeof answer === 'number'
                          ? formatUiNumber(answer, locale)
                          : locale === 'ar' && typeof answer === 'string'
                            ? localizeUiDigits(answer, locale)
                            : String(answer)}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
