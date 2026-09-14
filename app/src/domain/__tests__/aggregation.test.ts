import { describe, expect, it } from "vitest";
import { calcSetLoadKg } from "../aggregation";
import { INITIAL_EXERCISES } from "../exercises";
import type { SetRecord } from "../types";

const dumbbellBenchPress = INITIAL_EXERCISES.find((e) => e.id === "dumbbell-bench-press")!;
const oneArmRow = INITIAL_EXERCISES.find((e) => e.id === "dumbbell-one-arm-row")!;
const gobletSquat = INITIAL_EXERCISES.find((e) => e.id === "goblet-squat")!;
const pushup = INITIAL_EXERCISES.find((e) => e.id === "pushup-with-bar")!;

function baseSet(overrides: Partial<SetRecord>): SetRecord {
  return {
    id: "s1",
    sessionId: "sess1",
    exerciseId: "x",
    order: 0,
    side: "na",
    weightKg: null,
    pieceCount: 1,
    reps: 0,
    effort: "unknown",
    pain: false,
    isWarmup: false,
    completedAt: new Date().toISOString(),
    updatedVersion: 1,
    ...overrides,
  };
}

describe("負荷量計算(受入基準の検証用データ)", () => {
  it("2個使用・片手12kg・10回で240kg", () => {
    const set = baseSet({ weightKg: 12, pieceCount: 2, reps: 10, side: "both" });
    expect(calcSetLoadKg(set, dumbbellBenchPress)).toBe(240);
  });

  it("1個使用・左右各10回・12kgで合計240kg(二重計上しない)", () => {
    const left = baseSet({ weightKg: 12, pieceCount: 1, reps: 10, side: "left" });
    const right = baseSet({ weightKg: 12, pieceCount: 1, reps: 10, side: "right" });
    const total = (calcSetLoadKg(left, oneArmRow) ?? 0) + (calcSetLoadKg(right, oneArmRow) ?? 0);
    expect(total).toBe(240);
  });

  it("1個を両手で持って12kg・10回で120kg", () => {
    const set = baseSet({ weightKg: 12, pieceCount: 1, reps: 10, side: "na" });
    expect(calcSetLoadKg(set, gobletSquat)).toBe(120);
  });

  it("プッシュバーの自重種目は体重と同じ重量として集計しない(null)", () => {
    const set = baseSet({ weightKg: null, pieceCount: 1, reps: 15, side: "na" });
    expect(calcSetLoadKg(set, pushup)).toBeNull();
  });
});
