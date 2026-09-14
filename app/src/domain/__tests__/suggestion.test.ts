import { describe, expect, it } from "vitest";
import { suggestDumbbellProgression } from "../suggestion";
import { DUMBBELL_WEIGHT_STEPS_KG } from "../equipment";
import { INITIAL_EXERCISES } from "../exercises";
import type { SetRecord } from "../types";

const steps = DUMBBELL_WEIGHT_STEPS_KG;
const benchPress = INITIAL_EXERCISES.find((e) => e.id === "dumbbell-bench-press")!; // compound, maxIncrementKg 3
const curl = INITIAL_EXERCISES.find((e) => e.id === "dumbbell-curl")!; // isolation, maxIncrementKg 2

function set(overrides: Partial<SetRecord>): SetRecord {
  return {
    id: crypto.randomUUID(),
    sessionId: "s",
    exerciseId: "x",
    order: 0,
    side: "both",
    weightKg: 9,
    pieceCount: 2,
    reps: 12,
    effort: "2",
    pain: false,
    isWarmup: false,
    completedAt: new Date().toISOString(),
    updatedVersion: 1,
    ...overrides,
  };
}

describe("初回調整", () => {
  it("履歴がなければ最小重量(3kg)から始め、捏造しない", () => {
    const s = suggestDumbbellProgression(benchPress, "hypertrophy", steps, []);
    expect(s.isInitialAdjustment).toBe(true);
    expect(s.weightKg).toBe(3);
    expect(steps).toContain(s.weightKg);
  });
});

describe("増量ルール", () => {
  it("複合種目(増量上限3kg): 9→12kgのような+3kgの刻みは増量する", () => {
    const history = [
      set({ sessionId: "s1", weightKg: 9, reps: 12 }),
      set({ sessionId: "s2", weightKg: 9, reps: 12 }),
    ];
    const s = suggestDumbbellProgression(benchPress, "hypertrophy", steps, history);
    expect(s.weightKg).toBe(12);
  });

  it("複合種目(増量上限3kg): 18→21kg、27→30kgも増量する", () => {
    for (const w of [18, 27] as const) {
      const history = [
        set({ sessionId: "s1", weightKg: w, reps: 12 }),
        set({ sessionId: "s2", weightKg: w, reps: 12 }),
      ];
      const s = suggestDumbbellProgression(benchPress, "hypertrophy", steps, history);
      expect(s.weightKg).toBe(steps[steps.indexOf(w) + 1]);
    }
  });

  it("種目別の増加上限を超える刻みでは自動増量せず据え置く(アイソレーション種目)", () => {
    const history = [
      set({ sessionId: "s1", weightKg: 18, reps: 15 }),
      set({ sessionId: "s2", weightKg: 18, reps: 15 }),
    ];
    const s = suggestDumbbellProgression(curl, "hypertrophy", steps, history);
    // 18→21kgは+3kgでcurlの増量上限(2kg)を超えるため据え置き
    expect(s.weightKg).toBe(18);
    expect(s.reason).toContain("据え置き");
  });

  it("最大重量(36kg)に到達済みなら、それ以上の増量を強制しない", () => {
    const history = [
      set({ sessionId: "s1", weightKg: 36, reps: 12 }),
      set({ sessionId: "s2", weightKg: 36, reps: 12 }),
    ];
    const s = suggestDumbbellProgression(benchPress, "hypertrophy", steps, history);
    expect(s.weightKg).toBe(36);
  });

  it("最小重量(3kg)でも下限回数に届かない場合は代替種目を案内する", () => {
    const history = [set({ sessionId: "s1", weightKg: 3, reps: 4, effort: "1" })];
    const s = suggestDumbbellProgression(benchPress, "hypertrophy", steps, history);
    expect(s.weightKg).toBe(3);
    expect(s.suggestAlternativeExerciseIds).toBeDefined();
  });

  it("直近に痛みの申告があれば増量せず据え置く", () => {
    const history = [set({ sessionId: "s1", weightKg: 9, reps: 12, pain: true })];
    const s = suggestDumbbellProgression(benchPress, "hypertrophy", steps, history);
    expect(s.weightKg).toBe(9);
    expect(s.painWarning).toBe(true);
  });
});
