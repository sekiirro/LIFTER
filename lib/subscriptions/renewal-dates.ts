import {
  addCairoDays,
  compareCairoDates,
  type CairoDate,
} from '../time/cairo-calendar';

export type RenewalDateInput = {
  recordingDate: string;
  initialActivationDate: string | null;
  predecessorCoverageEndExclusive: string | null;
  durationDays: number;
  installmentOffsetsDays: readonly number[];
};

export type RenewalDates = {
  recordingDate: CairoDate;
  serviceStartDate: CairoDate;
  serviceEndExclusive: CairoDate;
  installmentDueDates: CairoDate[];
};

function validateRenewalInput(input: RenewalDateInput): void {
  compareCairoDates(input.recordingDate, input.recordingDate);
  if (input.initialActivationDate === null) {
    throw new RangeError('Renewal requires initial activation');
  }
  compareCairoDates(input.initialActivationDate, input.initialActivationDate);
  if (compareCairoDates(input.recordingDate, input.initialActivationDate) < 0) {
    throw new RangeError('Renewal recording cannot precede initial activation');
  }
  if (input.predecessorCoverageEndExclusive !== null) {
    compareCairoDates(
      input.predecessorCoverageEndExclusive,
      input.predecessorCoverageEndExclusive,
    );
  }
  if (!Number.isSafeInteger(input.durationDays) || input.durationDays <= 0) {
    throw new RangeError('Renewal duration must be a positive safe integer');
  }
  for (const offset of input.installmentOffsetsDays) {
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new RangeError(
        'Installment offsets must be nonnegative safe integers',
      );
    }
  }
}

/** Projects service coverage separately from renewal recording and installment dates. */
export function projectRenewalDates(input: RenewalDateInput): RenewalDates {
  validateRenewalInput(input);
  const serviceStartDate =
    input.predecessorCoverageEndExclusive !== null &&
    compareCairoDates(
      input.predecessorCoverageEndExclusive,
      input.recordingDate,
    ) > 0
      ? input.predecessorCoverageEndExclusive
      : input.recordingDate;

  return {
    recordingDate: input.recordingDate,
    serviceStartDate,
    serviceEndExclusive: addCairoDays(serviceStartDate, input.durationDays),
    installmentDueDates: input.installmentOffsetsDays.map((offset) =>
      addCairoDays(input.recordingDate, offset),
    ),
  };
}

/** Rejects a new renewal when the chain already has its one permitted unstarted successor. */
export function assertNoUnstartedRenewal(unstartedRenewalCount: number): void {
  if (
    !Number.isSafeInteger(unstartedRenewalCount) ||
    unstartedRenewalCount < 0
  ) {
    throw new RangeError(
      'Unstarted renewal count must be a nonnegative safe integer',
    );
  }
  if (unstartedRenewalCount > 0) {
    throw new RangeError('An unstarted renewal already exists');
  }
}

/**
 * Reflows a successor only while no actual service start or delivered access
 * would be rewritten. PO-2 installment dates remain based on its recording date.
 */
export function reprojectUnstartedRenewal(input: {
  renewal: RenewalDateInput;
  currentServiceStartDate: string;
  updatedPredecessorCoverageEndExclusive: string | null;
  successorHasStarted: boolean;
  successorHasDeliveredAccess: boolean;
}): { status: 'conflict' } | { status: 'reprojected'; dates: RenewalDates } {
  compareCairoDates(
    input.currentServiceStartDate,
    input.currentServiceStartDate,
  );
  const dates = projectRenewalDates({
    ...input.renewal,
    predecessorCoverageEndExclusive:
      input.updatedPredecessorCoverageEndExclusive,
  });
  const changesServiceStart =
    compareCairoDates(dates.serviceStartDate, input.currentServiceStartDate) !==
    0;
  if (
    changesServiceStart &&
    (input.successorHasStarted || input.successorHasDeliveredAccess)
  ) {
    return { status: 'conflict' };
  }
  return { status: 'reprojected', dates };
}
