// F17 volume pure function (T006; FR-016, SC-007).
//
// Working sets only: primary muscle 1.0, each secondary 0.5, warm-up 0.
// Reported per session and per week. Weeks are consecutive 7-program-day
// blocks (days 1-7, 8-14, ...); rest days stay inside their block and add
// zero; the final partial block counts as a week. No calendar date is used
// (S43-PO-5; architect mapping (S43-R6)).

export type VolumeSetType = 'warmup' | 'working';

export type VolumeSet = {
  type: VolumeSetType;
  exerciseId: string;
};

export type VolumeItem = {
  exerciseId: string;
  sets: VolumeSet[];
};

export type VolumeDay = {
  /** 1-based program day index. */
  dayIndex: number;
  kind: 'session' | 'rest';
  items: VolumeItem[];
};

export type MuscleMembership = {
  primary: string;
  secondaries: string[];
};

export type MuscleTotals = Record<string, number>;

export type SessionVolume = {
  dayIndex: number;
  totals: MuscleTotals;
};

export type WeekVolume = {
  week: number;
  days: number[];
  totals: MuscleTotals;
};

function addCredit(totals: MuscleTotals, muscle: string, credit: number): void {
  totals[muscle] = (totals[muscle] ?? 0) + credit;
}

export function computeVolume(
  days: VolumeDay[],
  muscles: Record<string, MuscleMembership>,
): { perSession: SessionVolume[]; perWeek: WeekVolume[] } {
  const perSession: SessionVolume[] = days.map((day) => {
    const totals: MuscleTotals = {};
    for (const item of day.items) {
      const membership = muscles[item.exerciseId];
      if (!membership) continue;
      for (const set of item.sets) {
        if (set.type !== 'working') continue;
        addCredit(totals, membership.primary, 1.0);
        for (const secondary of membership.secondaries) {
          addCredit(totals, secondary, 0.5);
        }
      }
    }
    return { dayIndex: day.dayIndex, totals };
  });

  const byWeek = new Map<number, WeekVolume>();
  const ordered = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
  for (const day of ordered) {
    const week = Math.floor((day.dayIndex - 1) / 7) + 1;
    let entry = byWeek.get(week);
    if (!entry) {
      entry = { week, days: [], totals: {} };
      byWeek.set(week, entry);
    }
    entry.days.push(day.dayIndex);
    const session = perSession.find((s) => s.dayIndex === day.dayIndex);
    if (session) {
      for (const [muscle, credit] of Object.entries(session.totals)) {
        addCredit(entry.totals, muscle, credit);
      }
    }
  }

  return { perSession, perWeek: [...byWeek.values()] };
}
