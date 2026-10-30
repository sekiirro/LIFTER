import { addCairoDays, compareCairoDates } from '../time/cairo-calendar';
import { countFreezeDays } from './freeze-dates';

export type FreezeRole =
  'platform_owner' | 'workspace_owner' | 'trainer' | 'sales';

export type FreezeApplication = {
  id: string;
  applyDate: string;
  durationDays: number;
  stopDate?: string;
  removed?: boolean;
};

export type FreezeApplyFact = {
  id: string;
  applied_on: string;
  duration_days: number;
};

export type FreezeEventFact = {
  freeze_id: string;
  kind: 'stop' | 'remove';
  effective_on: string;
};

/** Maps immutable DB facts into the pure entitlement projection input. */
export function freezeApplicationsFromFacts(
  applications: readonly FreezeApplyFact[],
  events: readonly FreezeEventFact[],
): FreezeApplication[] {
  const byId = new Map<string, FreezeApplication>();
  for (const fact of applications) {
    if (byId.has(fact.id))
      throw new RangeError('Freeze application IDs must be unique');
    byId.set(fact.id, {
      id: fact.id,
      applyDate: fact.applied_on,
      durationDays: fact.duration_days,
    });
  }
  const seen = new Set<string>();
  for (const event of events) {
    const application = byId.get(event.freeze_id);
    const key = `${event.freeze_id}:${event.kind}`;
    if (!application || seen.has(key))
      throw new RangeError('Freeze event must match one immutable application');
    seen.add(key);
    if (event.kind === 'stop') application.stopDate = event.effective_on;
    else application.removed = true;
  }
  return [...byId.values()];
}

const FREEZE_ROLES = new Set<FreezeRole>([
  'platform_owner',
  'workspace_owner',
  'trainer',
  'sales',
]);

export function canManageFreeze(role: string): role is FreezeRole {
  return FREEZE_ROLES.has(role as FreezeRole);
}

function validateApplication(application: FreezeApplication): void {
  if (application.id.length === 0)
    throw new RangeError('Freeze ID is required');
  compareCairoDates(application.applyDate, application.applyDate);
  if (
    !Number.isSafeInteger(application.durationDays) ||
    application.durationDays < 1 ||
    application.durationDays > 30
  ) {
    throw new RangeError(
      'Freeze duration must be between 1 and 30 calendar days',
    );
  }
  const plannedEnd = addCairoDays(
    application.applyDate,
    application.durationDays,
  );
  if (application.stopDate !== undefined) {
    compareCairoDates(application.stopDate, application.stopDate);
    if (
      compareCairoDates(application.stopDate, application.applyDate) < 0 ||
      compareCairoDates(application.stopDate, plannedEnd) >= 0
    ) {
      throw new RangeError(
        'Freeze Stop date is outside its applicable interval',
      );
    }
  }
}

function requireFreezeRole(role: string): void {
  if (!canManageFreeze(role))
    throw new RangeError('Role cannot manage freezes');
}

function activeIntervalEnd(application: FreezeApplication): string {
  if (application.removed) return application.applyDate;
  if (application.stopDate !== undefined) {
    const elapsed = countFreezeDays(
      application.applyDate,
      application.stopDate,
    );
    return addCairoDays(application.applyDate, elapsed);
  }
  return addCairoDays(application.applyDate, application.durationDays);
}

/** Validates and returns a copy of a new Apply fact; it does not write or mutate. */
export function validateFreezeApply(input: {
  role: string;
  activated: boolean;
  application: FreezeApplication;
  existingApplications: readonly FreezeApplication[];
}): FreezeApplication {
  requireFreezeRole(input.role);
  if (!input.activated)
    throw new RangeError('Freeze requires initial activation');
  validateApplication(input.application);
  if (input.application.stopDate !== undefined || input.application.removed) {
    throw new RangeError(
      'A new Apply fact cannot include Stop or Remove facts',
    );
  }
  const proposedEnd = addCairoDays(
    input.application.applyDate,
    input.application.durationDays,
  );

  const ids = new Set<string>();
  for (const existing of input.existingApplications) {
    validateApplication(existing);
    if (ids.has(existing.id) || existing.id === input.application.id) {
      throw new RangeError('Freeze application IDs must be unique');
    }
    ids.add(existing.id);
    if (existing.removed) continue;
    const existingEnd = activeIntervalEnd(existing);
    const overlaps =
      compareCairoDates(input.application.applyDate, existingEnd) < 0 &&
      compareCairoDates(existing.applyDate, proposedEnd) < 0;
    if (overlaps) throw new RangeError('Freeze intervals cannot overlap');
  }
  return { ...input.application };
}

/** Validates a Stop and returns its immutable fact separately from Apply. */
export function validateFreezeStop(input: {
  role: string;
  application: FreezeApplication;
  stopDate: string;
}): { applicationId: string; stopDate: string } {
  requireFreezeRole(input.role);
  validateApplication(input.application);
  compareCairoDates(input.stopDate, input.stopDate);
  if (input.application.removed || input.application.stopDate !== undefined) {
    throw new RangeError('Freeze is already stopped or removed');
  }
  if (
    compareCairoDates(input.stopDate, input.application.applyDate) < 0 ||
    compareCairoDates(
      input.stopDate,
      addCairoDays(input.application.applyDate, input.application.durationDays),
    ) >= 0
  ) {
    throw new RangeError('Freeze Stop date is outside its applicable interval');
  }
  return { applicationId: input.application.id, stopDate: input.stopDate };
}

/** Counts the planned, stopped, or removed contribution without changing facts. */
export function calculateFreezeContribution(
  application: FreezeApplication,
): number {
  validateApplication(application);
  if (application.removed) return 0;
  if (application.stopDate !== undefined) {
    return countFreezeDays(application.applyDate, application.stopDate);
  }
  return application.durationDays;
}

/** Derives the exclusive effective end from the base term and freeze facts. */
export function projectFreezeEnd(
  baseEndExclusive: string,
  freezes: readonly FreezeApplication[],
): { effectiveEndExclusive: string; extensionDays: number } {
  compareCairoDates(baseEndExclusive, baseEndExclusive);
  const ids = new Set<string>();
  let extensionDays = 0;
  for (const freeze of freezes) {
    validateApplication(freeze);
    if (ids.has(freeze.id))
      throw new RangeError('Freeze application IDs must be unique');
    ids.add(freeze.id);
    extensionDays += calculateFreezeContribution(freeze);
    if (!Number.isSafeInteger(extensionDays)) {
      throw new RangeError('Freeze extension exceeds the safe integer range');
    }
  }
  return {
    effectiveEndExclusive: addCairoDays(baseEndExclusive, extensionDays),
    extensionDays,
  };
}

export type FreezeRemovalProjection =
  | { status: 'conflict' }
  | {
      status: 'removed';
      effectiveEndExclusive: string;
      remainingExtensionDays: number;
    };

/** Projects a Remove fact, preserving current and already-delivered access. */
export function projectFreezeRemoval(input: {
  role: string;
  baseEndExclusive: string;
  freezes: readonly FreezeApplication[];
  freezeId: string;
  removeDate: string;
  latestDeliveredAccessEndExclusive: string | null;
  successor?: {
    recordingDate: string;
    currentServiceStartDate: string;
    successorHasStarted: boolean;
    successorHasDeliveredAccess: boolean;
  };
}): FreezeRemovalProjection {
  requireFreezeRole(input.role);
  compareCairoDates(input.removeDate, input.removeDate);
  compareCairoDates(input.baseEndExclusive, input.baseEndExclusive);
  if (input.latestDeliveredAccessEndExclusive !== null) {
    compareCairoDates(
      input.latestDeliveredAccessEndExclusive,
      input.latestDeliveredAccessEndExclusive,
    );
  }

  const ids = new Set<string>();
  let target: FreezeApplication | undefined;
  const frozenFacts = input.freezes.map((freeze) => {
    validateApplication(freeze);
    if (ids.has(freeze.id))
      throw new RangeError('Freeze application IDs must be unique');
    ids.add(freeze.id);
    if (freeze.id === input.freezeId) target = freeze;
    return { ...freeze };
  });
  if (!target || target.removed)
    throw new RangeError('Freeze cannot be removed');
  if (compareCairoDates(input.removeDate, target.applyDate) < 0) {
    throw new RangeError('Remove date cannot precede Apply date');
  }

  const withoutTarget = frozenFacts.map((freeze) =>
    freeze.id === input.freezeId ? { ...freeze, removed: true } : freeze,
  );
  const projected = projectFreezeEnd(input.baseEndExclusive, withoutTarget);
  const todayClamp = addCairoDays(input.removeDate, 1);
  let effectiveEndExclusive = projected.effectiveEndExclusive;
  if (compareCairoDates(effectiveEndExclusive, todayClamp) < 0) {
    effectiveEndExclusive = todayClamp;
  }
  if (
    input.latestDeliveredAccessEndExclusive !== null &&
    compareCairoDates(
      effectiveEndExclusive,
      input.latestDeliveredAccessEndExclusive,
    ) < 0
  ) {
    effectiveEndExclusive = input.latestDeliveredAccessEndExclusive;
  }

  if (input.successor) {
    compareCairoDates(
      input.successor.recordingDate,
      input.successor.recordingDate,
    );
    compareCairoDates(
      input.successor.currentServiceStartDate,
      input.successor.currentServiceStartDate,
    );
    const projectedServiceStart =
      compareCairoDates(effectiveEndExclusive, input.successor.recordingDate) >
      0
        ? effectiveEndExclusive
        : input.successor.recordingDate;
    const changesStartedSuccessor =
      compareCairoDates(
        projectedServiceStart,
        input.successor.currentServiceStartDate,
      ) !== 0 &&
      (input.successor.successorHasStarted ||
        input.successor.successorHasDeliveredAccess);
    if (changesStartedSuccessor) return { status: 'conflict' };
  }

  return {
    status: 'removed',
    effectiveEndExclusive,
    remainingExtensionDays: projected.extensionDays,
  };
}
