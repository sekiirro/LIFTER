const day = 86400000;
const midnight = (d) =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const week = (d) => midnight(d) - ((d.getUTCDay() + 6) % 7) * day;
const month = (d) => d.getUTCFullYear() * 12 + d.getUTCMonth();

/** Select the newest timestamp in each UTC calendar bucket, including the current bucket. */
export function selectRetained(dates, now = new Date()) {
  const buckets = new Set();
  const retained = new Set();
  for (const date of [...dates].sort((a, b) => b.getTime() - a.getTime())) {
    if (!Number.isFinite(date.getTime()) || date > now) continue;
    const ages = [
      (midnight(now) - midnight(date)) / day,
      (week(now) - week(date)) / (7 * day),
      month(now) - month(date),
    ];
    const keys = [midnight(date), week(date), month(date)];
    ages.forEach((age, i) => {
      const key = `${i}:${keys[i]}`;
      if (age >= 0 && age < [14, 8, 12][i] && !buckets.has(key)) {
        buckets.add(key);
        retained.add(date.getTime());
      }
    });
  }
  return retained;
}
