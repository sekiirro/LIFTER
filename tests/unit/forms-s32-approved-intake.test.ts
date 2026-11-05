import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMockFormsStaffAdapter } from '../../lib/forms/mock-staff-adapter';
import { resolveFormLabel } from '../../lib/forms/types';
import { validateFormDefinition } from '../../lib/forms/validation';
import { getMessages } from '../../lib/i18n';
import approvedF15Copy from '../fixtures/forms/approved-f15-copy.json';

const root = process.cwd();
const starter = JSON.parse(
  readFileSync(resolve(root, 'lib/forms/s14-starter-content.json'), 'utf8'),
);
const manifest = JSON.parse(
  readFileSync(
    resolve(root, 'tests/fixtures/forms/body-fat-derivative-manifest.json'),
    'utf8',
  ),
);
const question = (id: string) =>
  starter.questions.find((item: { id: string }) => item.id === id);

describe('S32-PO-5/PO-8 intake starter controls', () => {
  it('keeps approved controls in Basic → Training → Nutrition question order', () => {
    const ids = starter.questions.map(
      (item: { id: string }) => item.id,
    ) as string[];
    expect(ids.indexOf('B01')).toBeLessThan(ids.indexOf('B06'));
    expect(ids.indexOf('B06')).toBeLessThan(ids.indexOf('T03'));
    expect(ids.indexOf('T03')).toBeLessThan(ids.indexOf('T08'));
    expect(ids.indexOf('T08')).toBeLessThan(ids.indexOf('N07.meal_count'));
    expect(ids.indexOf('N07.meal_count')).toBeLessThan(
      ids.indexOf('N07.training_timing'),
    );
    expect(ids.indexOf('N07.training_timing')).toBeLessThan(ids.indexOf('N08'));
    expect(ids.indexOf('N08')).toBeLessThan(ids.indexOf('N08.foods'));
    expect(ids.at(-1)).toBe('N12');
  });

  it('uses the approved B01/B06/T08/N08 English copy and B06 options', () => {
    expect(question('B01').label.en).toBe('Full name (three parts)');
    expect(question('B01').type).toBe('profileText');
    expect(question('B06')).toMatchObject({
      type: 'singleChoice',
      label: { en: 'Gender' },
      choices: ['male', 'female'],
      optionLabels: [
        { en: 'Male', ar: 'ذكر' },
        { en: 'Female', ar: 'أنثى' },
      ],
      purpose: 'n12-series',
    });
    expect(question('T08').label.en).toBe('Training split');
    expect(question('N08').label.en).toBe('What’s your food budget?');
  });

  it('uses the PO-approved exact T03 labels in both locales', async () => {
    expect(question('T03').choices).toEqual(['2', '3', '4', '5', '6']);
    expect(
      question('T03').optionLabels.map((item: { en: string }) => item.en),
    ).toEqual(['2 days', '3 days', '4 days', '5 days', '6 days']);
    expect(
      question('T03').optionLabels.map((item: { ar: string }) => item.ar),
    ).toEqual(['2', '3', '4', '5', '6']);
    const result = await createMockFormsStaffAdapter().publish(
      'po',
      'your-first-step',
    );
    expect(result.status).toBe('invalid');
  });

  it('derives meal timing from the selected count and retains the same N08 prompt', () => {
    expect(question('N07.meal_count')).toMatchObject({
      type: 'mealCount',
      choices: ['2', '3', '4', '5'],
    });
    expect(question('N07.training_timing')).toMatchObject({
      type: 'derivedChoice',
      label: { en: 'After which meal would you like to train?' },
      derivedOptions: {
        sourceQuestionId: 'N07.meal_count',
        fixedChoices: ['before-first', 'no-fixed-time'],
      },
    });
    expect(question('N07.training_timing').optionLabels[5].en).toBe(
      'Before the first meal',
    );
    expect(question('N07.training_timing').optionLabels[0].ar).toBe(
      'الوجبة رقم {number}',
    );
    expect(question('N07.training_timing').optionLabels[6].en).toBe(
      "I don't have a fixed time",
    );
    expect(question('N08.foods').when.conditions).toHaveLength(3);
    expect(question('N08.foods').when.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionId: 'N08', value: 'low' }),
        expect.objectContaining({ questionId: 'N08', value: 'medium' }),
        expect.objectContaining({ questionId: 'N08', value: 'high' }),
      ]),
    );
  });

  it('pins the S34-approved changed English intake rows and all 68 approvals', () => {
    expect(question('T08.system')).toMatchObject({
      label: { en: 'What training split would you like to follow?' },
      when: {
        mode: 'all',
        conditions: [
          { questionId: 'T08', operator: 'equals', value: true },
        ],
      },
    });
    expect(question('N07.meal_count')).toMatchObject({
      label: { en: 'How many meals would you like to eat per day?' },
      optionLabels: [
        { en: '2 meals' },
        { en: '3 meals' },
        { en: '4 meals' },
        { en: '5 meals' },
      ],
    });
    expect(question('N07.training_timing').optionLabels[6].en).toBe(
      "I don't have a fixed time",
    );
    expect(
      approvedF15Copy.find((row) => row.key === 'intake.N11.label.0'),
    ).toMatchObject({ en: 'I barely feel hungry', approvedBy: 'S34-PO-6' });
    const intakeApprovals = approvedF15Copy.filter(
      (row) => row.approvedBy === 'S34-PO-6',
    );
    expect(intakeApprovals).toHaveLength(68);
    expect(
      approvedF15Copy.filter((row) => row.approvedBy === 'S34-PO-4'),
    ).toHaveLength(5);
  });

  it('uses the exact Arabic meal-number template from S33-PO-3', () => {
    expect(getMessages('ar')['forms.afterMealNumber']).toBe(
      'الوجبة رقم {number}',
    );
  });

  it('preserves the 0–10 slider bands and N12 manifest order, alt text, and assets', () => {
    expect(question('N11')).toMatchObject({
      type: 'slider',
      validation: { min: 0, max: 10, step: 1 },
    });
    expect(
      question('N11').feedbackBands.map(
        ({ min, max }: { min: number; max: number }) => [min, max],
      ),
    ).toEqual([
      [0, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
    ]);

    const entries = [...manifest.series.male, ...manifest.series.female];
    expect(question('N12').assetReferences).toEqual(
      entries.map(
        ({ derivatives }: { derivatives: { webp: { path: string } } }) =>
          `/${derivatives.webp.path.replace(/^public\//, '')}`,
      ),
    );
    expect(question('N12').optionLabels).toEqual(
      entries.map(({ percentage }: { percentage: number }) => ({
        en: `${percentage}%`,
        ar: `${percentage}%`,
      })),
    );
    for (const path of question('N12').assetReferences) {
      expect(existsSync(resolve(root, `public${path}`))).toBe(true);
    }
    expect(
      validateFormDefinition(
        starter.questions.map(
          ({ label, ...formQuestion }: Record<string, unknown>) => {
            void label;
            return formQuestion;
          },
        ),
      ),
    ).toEqual([]);
  });

  it('renders the approved N11 minimum label in English and preserves Arabic', () => {
    expect(resolveFormLabel(question('N11').labels.minimum, 'en')).toBe(
      'I barely feel hungry',
    );
    expect(resolveFormLabel(question('N11').labels.minimum, 'ar')).toBe(
      'مش بجوع تقريبًا',
    );
  });
});
