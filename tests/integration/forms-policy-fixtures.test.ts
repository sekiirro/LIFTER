import { expect, it } from 'vitest';
import { withFormsPolicyF13Fixtures } from './forms-policy-fixtures';

it('builds early-paid, freeze-reflowed, resumed, and expired F13 policy fixtures', async () => {
  let checked = false;
  await withFormsPolicyF13Fixtures(async (_tx, _f, scenarios) => {
    expect(scenarios.earlyPaidRenewal.occurrenceKey).toMatch(/^renewal:/);
    expect(scenarios.earlyPaidRenewal.serviceStart).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(scenarios.reflowedRenewal.occurrenceKey).toMatch(/^renewal:/);
    expect(scenarios.reflowedRenewal.serviceStart).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(scenarios.frozenThenUnfrozen.subscriptionId).toBeTruthy();
    expect(scenarios.expiredSubscription.subscriptionId).toBeTruthy();
    checked = true;
  });
  expect(checked).toBe(true);
});
