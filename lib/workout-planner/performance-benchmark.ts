export type PerformanceMeasurements = {
  typicalP95Ms: number;
  maximumP95Ms: number;
  maximumBytes: number;
  capBytes: number;
  overCapRejected: boolean;
};

export function assertPerformanceMeasurements(
  measurements: PerformanceMeasurements,
): void {
  if (measurements.maximumBytes !== measurements.capBytes)
    throw new Error('maximum document did not reach the configured byte cap');
  if (measurements.typicalP95Ms > 300)
    throw new Error('7-day/40-exercise plan exceeded the 300 ms p95 target');
  if (measurements.maximumP95Ms > 300)
    throw new Error('maximum document exceeded the 300 ms p95 target');
  if (!measurements.overCapRejected)
    throw new Error('document above the byte cap was accepted');
}
