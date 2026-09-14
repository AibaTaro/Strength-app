import type { Goal, RepRangeSetting } from "./types";

/**
 * 回数範囲・セット数・増加上限の設定表。コードに散在させずここで一元管理する。
 * 数値は実装・検証用の仮ルールであり、専門家未確認（公開する場合は要確認）。
 */
export type ExerciseKind = "compound" | "isolation" | "bodyweight";

const TEMPLATES: Record<ExerciseKind, Record<Goal, RepRangeSetting>> = {
  compound: {
    hypertrophy: { minReps: 8, maxReps: 12, sets: 3, maxIncrementKg: 3 },
    strength: { minReps: 4, maxReps: 6, sets: 4, maxIncrementKg: 3 },
    fatloss: { minReps: 12, maxReps: 15, sets: 3, maxIncrementKg: 2 },
    health: { minReps: 10, maxReps: 12, sets: 2, maxIncrementKg: 2 },
  },
  isolation: {
    hypertrophy: { minReps: 10, maxReps: 15, sets: 3, maxIncrementKg: 2 },
    strength: { minReps: 6, maxReps: 8, sets: 3, maxIncrementKg: 2 },
    fatloss: { minReps: 12, maxReps: 15, sets: 2, maxIncrementKg: 2 },
    health: { minReps: 10, maxReps: 12, sets: 2, maxIncrementKg: 2 },
  },
  bodyweight: {
    hypertrophy: { minReps: 10, maxReps: 15, sets: 3, maxIncrementKg: 0 },
    strength: { minReps: 6, maxReps: 10, sets: 4, maxIncrementKg: 0 },
    fatloss: { minReps: 15, maxReps: 20, sets: 3, maxIncrementKg: 0 },
    health: { minReps: 10, maxReps: 15, sets: 2, maxIncrementKg: 0 },
  },
};

export function repRangeFor(kind: ExerciseKind): Record<Goal, RepRangeSetting> {
  return TEMPLATES[kind];
}
