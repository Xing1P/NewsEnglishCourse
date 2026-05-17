import { describe, expect, it } from "vitest";
import { applyGrade, DEFAULT_STATE, nextDueIso, streakFromDays } from "./spacedRepetition";

describe("applyGrade", () => {
  it("starts with 1-day interval after first 'good'", () => {
    const next = applyGrade(DEFAULT_STATE, "good");
    expect(next.repetitions).toBe(1);
    expect(next.intervalDays).toBe(1);
    expect(next.easeFactor).toBeGreaterThan(0);
  });

  it("uses 3-day interval after second 'good'", () => {
    const first = applyGrade(DEFAULT_STATE, "good");
    const second = applyGrade(first, "good");
    expect(second.repetitions).toBe(2);
    expect(second.intervalDays).toBe(3);
  });

  it("resets repetitions on 'again'", () => {
    const learning = applyGrade(applyGrade(DEFAULT_STATE, "good"), "good");
    const lapsed = applyGrade(learning, "again");
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.intervalDays).toBe(1);
    expect(lapsed.streak).toBe(0);
  });

  it("ease factor stays >= 1.3", () => {
    let state = DEFAULT_STATE;
    for (let i = 0; i < 10; i++) state = applyGrade(state, "again");
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("'easy' grows interval faster than 'good'", () => {
    const a = applyGrade(applyGrade(applyGrade(DEFAULT_STATE, "good"), "good"), "good");
    const b = applyGrade(applyGrade(applyGrade(DEFAULT_STATE, "good"), "good"), "easy");
    expect(b.intervalDays).toBeGreaterThan(a.intervalDays);
  });
});

describe("nextDueIso", () => {
  it("adds whole days", () => {
    const now = new Date("2026-05-17T10:00:00Z");
    const due = nextDueIso(now, 3);
    expect(due.startsWith("2026-05-20")).toBe(true);
  });
});

describe("streakFromDays", () => {
  it("counts consecutive trailing days from today", () => {
    expect(streakFromDays(["2026-05-17", "2026-05-16", "2026-05-15"], "2026-05-17")).toBe(3);
  });
  it("resets if gap", () => {
    expect(streakFromDays(["2026-05-17", "2026-05-15"], "2026-05-17")).toBe(1);
  });
  it("accepts yesterday as start", () => {
    expect(streakFromDays(["2026-05-16", "2026-05-15"], "2026-05-17")).toBe(2);
  });
  it("returns 0 with no recent activity", () => {
    expect(streakFromDays(["2026-05-10"], "2026-05-17")).toBe(0);
  });
});
