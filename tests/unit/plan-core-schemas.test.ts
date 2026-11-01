import { describe, expect, it } from 'vitest';
import {
  PlanCoreValidationError,
  normalizePlanId,
  normalizePrivateDraft,
  normalizeImmutableRevisionRef,
  normalizeCreatePlanInput,
  normalizeCreateMode,
  normalizeReadinessState,
  normalizeExpectedPublishedVersion,
  normalizeRevisionTransition,
  isValidRevisionTransition,
} from '../../lib/plan-core/schemas';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('plan core lifecycle schemas', () => {
  it('accepts a valid plan id', () => {
    expect(normalizePlanId(VALID_UUID)).toBe(VALID_UUID);
  });

  it('rejects malformed plan ids', () => {
    expect(() => normalizePlanId('not-a-uuid')).toThrow(
      PlanCoreValidationError,
    );
    expect(() => normalizePlanId('')).toThrow(PlanCoreValidationError);
  });

  it('accepts a private draft payload', () => {
    const result = normalizePrivateDraft({
      planId: VALID_UUID,
      visibility: 'private',
    });
    expect(result.visibility).toBe('private');
  });

  it('rejects a non-private draft', () => {
    expect(() =>
      normalizePrivateDraft({ planId: VALID_UUID, visibility: 'public' }),
    ).toThrow(PlanCoreValidationError);
  });

  it('accepts an immutable revision reference', () => {
    const result = normalizeImmutableRevisionRef({
      planId: VALID_UUID,
      revisionId: VALID_UUID,
      revisionNumber: 1,
      publishedVersion: 0,
      authorId: VALID_UUID,
    });
    expect(result.revisionNumber).toBe(1);
    expect(result.authorId).toBe(VALID_UUID);
  });

  it('rejects a revision without authorId', () => {
    expect(() =>
      normalizeImmutableRevisionRef({
        planId: VALID_UUID,
        revisionId: VALID_UUID,
        revisionNumber: 1,
        publishedVersion: 0,
      }),
    ).toThrow(PlanCoreValidationError);
  });

  it('rejects implicit create (missing discriminator)', () => {
    expect(() => normalizeCreatePlanInput({})).toThrow(PlanCoreValidationError);
    expect(() => normalizeCreatePlanInput({ title: 'x' })).toThrow(
      PlanCoreValidationError,
    );
  });

  it('rejects legacy create flags', () => {
    for (const legacy of [
      { mode: 'blank' },
      { createNewPlan: true },
      { newPlan: true },
      { explicitCreate: true },
      { explicit: true },
      { planId: VALID_UUID },
      { mode: 'template', templateId: VALID_UUID },
      { createNewPlan: true, templateId: VALID_UUID },
    ]) {
      expect(() => normalizeCreatePlanInput(legacy)).toThrow(
        PlanCoreValidationError,
      );
    }
  });

  it('rejects template create without templateId', () => {
    expect(() => normalizeCreatePlanInput({ createMode: 'template' })).toThrow(
      PlanCoreValidationError,
    );
  });

  it('rejects template create with an invalid templateId', () => {
    expect(() =>
      normalizeCreatePlanInput({ createMode: 'template', templateId: null }),
    ).toThrow(PlanCoreValidationError);
  });

  it('rejects existing_plan create without sourcePlanId', () => {
    expect(() =>
      normalizeCreatePlanInput({ createMode: 'existing_plan' }),
    ).toThrow(PlanCoreValidationError);
  });

  it('rejects blank create with extra fields', () => {
    expect(() =>
      normalizeCreatePlanInput({
        createMode: 'blank',
        templateId: VALID_UUID,
      }),
    ).toThrow(PlanCoreValidationError);
    expect(() =>
      normalizeCreatePlanInput({
        createMode: 'blank',
        sourcePlanId: VALID_UUID,
      }),
    ).toThrow(PlanCoreValidationError);
  });

  it('accepts each valid create variant', () => {
    expect(normalizeCreatePlanInput({ createMode: 'blank' })).toBeTruthy();
    expect(
      normalizeCreatePlanInput({
        createMode: 'template',
        templateId: VALID_UUID,
      }),
    ).toBeTruthy();
    expect(
      normalizeCreatePlanInput({
        createMode: 'existing_plan',
        sourcePlanId: VALID_UUID,
      }),
    ).toBeTruthy();
  });

  it('accepts only the three spec create modes', () => {
    expect(normalizeCreateMode('blank')).toBe('blank');
    expect(normalizeCreateMode('template')).toBe('template');
    expect(normalizeCreateMode('existing_plan')).toBe('existing_plan');
  });

  it('rejects non-spec create mode spellings', () => {
    for (const spelling of [
      'existing',
      'from_blank',
      'from_template',
      'from_existing',
      'from_existing_plan',
      'fromExistingPlan',
    ]) {
      expect(() => normalizeCreateMode(spelling)).toThrow(
        PlanCoreValidationError,
      );
    }
  });

  it('accepts readiness states', () => {
    expect(normalizeReadinessState('draft')).toBe('draft');
    expect(normalizeReadinessState('ready_to_publish')).toBe(
      'ready_to_publish',
    );
  });

  it('accepts expected published version numbers', () => {
    expect(normalizeExpectedPublishedVersion(0)).toBe(0);
    expect(normalizeExpectedPublishedVersion(3)).toBe(3);
  });

  it('rejects invalid revision transitions', () => {
    expect(isValidRevisionTransition(1, 1)).toBe(false);
    expect(isValidRevisionTransition(2, 1)).toBe(false);
    expect(() => {
      normalizeRevisionTransition({ fromVersion: 2, toVersion: 2 });
    }).toThrow(PlanCoreValidationError);
  });

  it('accepts valid revision transitions', () => {
    expect(isValidRevisionTransition(0, 1)).toBe(true);
    expect(isValidRevisionTransition(1, 2)).toBe(true);
  });
});
