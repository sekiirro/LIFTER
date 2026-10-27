export function percentile(values, p) {
  if (!values.length || !Number.isFinite(p) || p < 0 || p > 100)
    throw new RangeError('Invalid percentile');
  if (values.some((value) => !Number.isFinite(value)))
    throw new RangeError('Invalid sample');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function pct(value, limit) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isFinite(limit) ||
    limit <= 0
  )
    throw new RangeError('Invalid value or limit');
  return (value / limit) * 100;
}

export function verdict(value, limit) {
  const percentage = pct(value, limit);
  return percentage > 100 ? 'over' : percentage >= 70 ? 'warn' : 'ok';
}
