import type { ReviewGrade } from "../shared/schemas";

export type SrsState = {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  streak: number;
};

export const DEFAULT_STATE: SrsState = {
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
  streak: 0
};

// SM-2 with grade buckets: again=0, hard=3, good=4, easy=5 (SuperMemo-style q values).
export function applyGrade(prev: SrsState, grade: ReviewGrade): SrsState {
  const q = qualityFor(grade);
  let easeFactor = prev.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  if (q < 3) {
    return {
      easeFactor,
      intervalDays: 1,
      repetitions: 0,
      streak: 0
    };
  }

  const repetitions = prev.repetitions + 1;
  let intervalDays: number;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = grade === "easy" ? 4 : 3;
  else intervalDays = Math.round(prev.intervalDays * easeFactor);
  if (grade === "hard") intervalDays = Math.max(1, Math.round(intervalDays * 0.8));
  if (grade === "easy") intervalDays = Math.round(intervalDays * 1.3);

  return {
    easeFactor,
    intervalDays,
    repetitions,
    streak: prev.streak + 1
  };
}

export function nextDueIso(now: Date, intervalDays: number): string {
  const due = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return due.toISOString();
}

function qualityFor(grade: ReviewGrade): number {
  switch (grade) {
    case "again":
      return 0;
    case "hard":
      return 3;
    case "good":
      return 4;
    case "easy":
      return 5;
  }
}

export function streakFromDays(daysDesc: string[], todayIso: string): number {
  if (!daysDesc.length) return 0;
  const today = todayIso.slice(0, 10);
  const yesterday = isoDayOffset(today, -1);
  if (daysDesc[0] !== today && daysDesc[0] !== yesterday) return 0;
  let streak = 0;
  let cursor = daysDesc[0];
  for (const day of daysDesc) {
    if (day !== cursor) break;
    streak += 1;
    cursor = isoDayOffset(cursor, -1);
  }
  return streak;
}

function isoDayOffset(isoDay: string, deltaDays: number): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}
