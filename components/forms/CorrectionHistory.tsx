import { getMessages } from '../../lib/i18n';
import type { Locale } from '../../lib/design/preferences';
import { Bidi } from '../ui/Bidi';
import { formatUiNumber, localizeUiDigits } from '../../lib/i18n/format-digits';
import type { LabeledQuestion } from './QuestionFlow';
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
  questions,
}: {
  locale: Locale;
  entries: readonly AnswerHistoryEntry[];
  questions: readonly LabeledQuestion[];
}) {
  const messages = getMessages(locale);
  const questionById = new Map(
    questions.map((question) => [question.id, question]),
  );

  function answerLabel(questionId: string, value: unknown) {
    const question = questionById.get(questionId);
    if (typeof value === 'string' && question) {
      if (question.type === 'derivedChoice' && value.startsWith('meal-')) {
        return (
          <>
            {messages['forms.afterMealNumber'].split('{number}')[0]}
            <Bidi dir="ltr">{value.slice(5)}</Bidi>
          </>
        );
      }
      const choiceIndex = question.choices?.indexOf(value) ?? -1;
      const localized =
        choiceIndex >= 0 ? question.optionLabels?.[choiceIndex]?.[locale] : '';
      if (localized) return localized;
    }
    if (typeof value === 'number') return formatUiNumber(value, locale);
    if (locale === 'ar' && typeof value === 'string')
      return localizeUiDigits(value, locale);
    return String(value);
  }

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
                      {questionById.has(questionId) ? (
                        questionById.get(questionId)?.title[locale]
                      ) : (
                        <Bidi dir="ltr">{questionId}</Bidi>
                      )}
                    </dt>
                    <dd>
                      {Array.isArray(answer)
                        ? answer
                            .map((value) => answerLabel(questionId, value))
                            .join(', ')
                        : answerLabel(questionId, answer)}
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
