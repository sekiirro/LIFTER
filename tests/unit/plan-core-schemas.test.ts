import { describe, expect, it } from 'vitest';
import {
  PlanIdSchema,
  PrivateDraftSchema,
  ImmutableRevisionRefSchema,
  CreatePlanInputSchema,
  CreateModeSchema,
  ReadinessStateSchema,
  ExpectedPublishedVersionSchema,
  isValidRevisionTransition,
  RevisionTransitionSchema,
} from '../../lib/plan-core/schemas';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('plan core lifecycle schemas', () => {
  it('accepts a valid plan id', () => {
    expect(PlanIdSchema.parse(VALID_UUID)).toBe(VALID_UUID);
  });

  it('rejects malformed plan ids', () => {
    expect(() => PlanIdSchema.parse('not-a-uuid')).toThrow();
    expect(() => PlanIdSchema.parse('')).toThrow();
  });

  it('accepts a private draft payload', () => {
    const result = PrivateDraftSchema.parse({
      planId: VALID_UUID,
      visibility: 'private',
    });
    expect(result.visibility).toBe('private');
  });

  it('rejects a non-private draft', () => {
    expect(() =>
      PrivateDraftSchema.parse({ planId: VALID_UUID, visibility: 'public' }),
    ).toThrow();
  });

  it('accepts an immutable revision reference', () => {
    const result = ImmutableRevisionRefSchema.parse({
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
      ImmutableRevisionRefSchema.parse({
        planId: VALID_UUID,
        revisionId: VALID_UUID,
        revisionNumber: 1,
        publishedVersion: 0,
      }),
    ).toThrow();
  });

  it('rejects implicit create (missing discriminator)', () => {
    expect(() => CreatePlanInputSchema.parse({})).toThrow();
    expect(() => CreatePlanInputSchema.parse({ title: 'x' })).toThrow();
  });

  it('accepts explicit create modes', () => {
    expect(CreatePlanInputSchema.parse({ createMode: 'blank' })).toBeTruthy();
    expect(
      CreatePlanInputSchema.parse({ createMode: 'template' }),
    ).toBeTruthy();
    expect(
      CreatePlanInputSchema.parse({ createMode: 'existing_plan' }),
    ).toBeTruthy();
  });

  it('accepts only the three spec create modes', () => {
    expect(CreateModeSchema.parse('blank')).toBe('blank');
    expect(CreateModeSchema.parse('template')).toBe('template');
    expect(CreateModeSchema.parse('existing_plan')).toBe('existing_plan');
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
      expect(() => CreateModeSchema.parse(spelling)).toThrow();
    }
  });

  it('accepts readiness states', () => {
    expect(ReadinessStateSchema.parse('draft')).toBe('draft');
    expect(ReadinessStateSchema.parse('ready_to_publish')).toBe(
      'ready_to_publish',
    );
  });

  it('accepts expected published version numbers', () => {
    expect(ExpectedPublishedVersionSchema.parse(0)).toBe(0);
    expect(ExpectedPublishedVersionSchema.parse(3)).toBe(3);
  });

  it('rejects invalid revision transitions', () => {
    expect(isValidRevisionTransition(1, 1)).toBe(false);
    expect(isValidRevisionTransition(2, 1)).toBe(false);
    expect(() => {
      RevisionTransitionSchema.parse({ fromVersion: 2, toVersion: 2 });
    }).toThrow();
  });

  it('accepts valid revision transitions', () => {
    expect(isValidRevisionTransition(0, 1)).toBe(true);
    expect(isValidRevisionTransition(1, 2)).toBe(true);
  });
});
