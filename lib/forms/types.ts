export type LocalizedFormText = { en: string; ar: string };

export function resolveFormLabel(
  label: string | LocalizedFormText,
  locale: 'en' | 'ar',
): string {
  return typeof label === 'string' ? label : label[locale];
}

export type FormAnswerType =
  | 'shortText'
  | 'longText'
  | 'number'
  | 'singleChoice'
  | 'multiChoice'
  | 'boolean'
  | 'date'
  | 'slider'
  | 'imageChoice'
  | 'mealCount'
  | 'derivedChoice'
  | 'displayOnly'
  | 'profileText'
  | 'computedAge';

export type AnswerableFormType = Exclude<
  FormAnswerType,
  'displayOnly' | 'profileText' | 'computedAge'
>;

export type FormAnswer = string | number | boolean | readonly string[];
export type FormAnswerSet = Readonly<Record<string, FormAnswer>>;
export type ConditionValue = string | number | boolean;

export type ApplicabilityCondition =
  | {
      questionId: string;
      operator: 'equals' | 'notEquals';
      value: ConditionValue;
    }
  | { questionId: string; operator: 'contains'; value: string }
  | { questionId: string; operator: 'isAnswered' };

export type ApplicabilityRule = {
  mode: 'all' | 'any';
  conditions: readonly ApplicabilityCondition[];
};

export type FormValidationRules = {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
};

export type FormFeedbackBand = {
  min: number;
  max: number;
  text: string;
};

export type FormQuestion = {
  id: string;
  sectionId: string;
  type: FormAnswerType;
  required: boolean;
  charLimit?: number;
  choices?: readonly string[];
  optionLabels?: readonly LocalizedFormText[];
  validation?: FormValidationRules;
  when?: ApplicabilityRule;
  privacy?: 'personal' | 'health';
  purpose?: 'n12-series';
  unit?: LocalizedFormText;
  labels?: {
    minimum: string | LocalizedFormText;
    middle: string | LocalizedFormText;
    maximum: string | LocalizedFormText;
  };
  feedbackBands?: readonly FormFeedbackBand[];
  assetReferences?: readonly string[];
  displayText?: LocalizedFormText;
  profileField?: 'fullName';
  dateOfBirthField?: 'dateOfBirth';
  derivedOptions?: {
    sourceQuestionId: string;
    fixedChoices: readonly string[];
  };
};
