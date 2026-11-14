import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuestionFlow } from '../../components/forms/QuestionFlow';
import { StaffSlaAlerts } from '../../components/forms/StaffSlaAlerts';
import { formatUiNumber, localizeUiDigits } from '../../lib/i18n/format-digits';

describe('F15 Arabic numeral rendering', () => {
  it('renders question progress and character counts with Arabic digits', () => {
    expect(formatUiNumber(1, 'ar')).toBe('١');
    expect(formatUiNumber(150, 'ar')).toBe('١٥٠');
    expect(localizeUiDigits('السؤال 1 من 3، الأحرف: 0 من 150', 'ar')).toBe(
      'السؤال ١ من ٣، الأحرف: ٠ من ١٥٠',
    );
  });

  it('renders the Arabic F15 question flow without Latin digits in visible text', () => {
    const html = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'ar',
        assignmentId: 'fixture',
        questions: [
          {
            id: 'goal',
            sectionId: 'basic',
            type: 'shortText',
            required: true,
            charLimit: 150,
            title: { ar: 'الهدف', en: 'Goal' },
          },
        ],
        adapter: {
          reloadDraft: async () => ({ status: 'loaded' as const }),
          reloadSubmitted: async () => ({ status: 'loaded' as const }),
          saveDraft: async () => ({ status: 'saved' as const }),
          submit: async () => ({ status: 'submitted' as const }),
          correct: async () => ({ status: 'saved' as const }),
        },
      }),
    );
    const visibleText = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    expect(visibleText).toContain('السؤال ١ من ١');
    expect(visibleText).toContain('الأحرف: ٠ من ١٥٠');
    expect(visibleText).not.toMatch(/[0-9]/u);
    expect(visibleText).not.toContain('تم حفظ المسودة.');
  });

  it('keeps Latin digits in English UI', () => {
    expect(formatUiNumber(150, 'en')).toBe('150');
  });

  it('renders staff deadline and SLA figures without Latin digits in Arabic', () => {
    const html = renderToStaticMarkup(
      createElement(StaffSlaAlerts, {
        locale: 'ar',
        assignments: [
          {
            id: 'trainer-case',
            formReference: 'form',
            clientReference: 'client',
            assignedAt: '2026-11-01T08:00:00.000Z',
            deadlineAt: '2026-11-03T08:00:00.000Z',
            kind: 'trainer-late',
            trainerAssigned: true,
            resolvedAt: null,
          },
        ],
      }),
    );
    const visibleText = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    expect(visibleText).toContain('مهلة تسليم D-٠٣');
    expect(visibleText).toContain('٢٤');
    expect(visibleText).not.toMatch(/[0-9]/u);
  });
});
