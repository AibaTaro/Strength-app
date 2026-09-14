import type { DumbbellEquipment, BenchEquipment, PushUpBarEquipment, Equipment } from "./types";

/** 片手あたりの利用可能重量(kg)。フレックスベルの16段階。ユーザー申告による確定値。上書き禁止。 */
export const DUMBBELL_WEIGHT_STEPS_KG = [
  3, 5, 7, 9, 12, 14, 16, 18, 21, 23, 25, 27, 30, 32, 34, 36,
] as const;

export function createInitialEquipment(): Equipment[] {
  const dumbbell: DumbbellEquipment = {
    id: "eq-dumbbell-flexbell",
    type: "dumbbell",
    name: "フレックスベル",
    count: 2,
    weightStepsKg: [...DUMBBELL_WEIGHT_STEPS_KG],
  };
  const bench: BenchEquipment = {
    id: "eq-bench-steady-st123",
    type: "bench",
    name: "STEADY ST123",
    angleConfirmed: false,
  };
  const pushUpBar: PushUpBarEquipment = {
    id: "eq-pushupbar",
    type: "pushUpBar",
    name: "プッシュバー",
  };
  return [dumbbell, bench, pushUpBar];
}

export function getDumbbell(equipment: Equipment[]): DumbbellEquipment | undefined {
  return equipment.find((e): e is DumbbellEquipment => e.type === "dumbbell");
}

export function getBench(equipment: Equipment[]): BenchEquipment | undefined {
  return equipment.find((e): e is BenchEquipment => e.type === "bench");
}

export function hasPushUpBar(equipment: Equipment[]): boolean {
  return equipment.some((e) => e.type === "pushUpBar");
}

/**
 * 指定重量から見て1段階上/下の登録重量を返す。範囲外なら現在値のまま(端で止まる)。
 * 16段階以外の値(捏造値)は絶対に返さない。
 */
export function stepWeight(
  steps: readonly number[],
  currentKg: number,
  direction: 1 | -1
): number {
  const sorted = [...steps].sort((a, b) => a - b);
  const idx = sorted.indexOf(currentKg);
  if (idx === -1) {
    // 未登録値からは最も近い段階へ丸める
    const nearest = sorted.reduce((best, v) =>
      Math.abs(v - currentKg) < Math.abs(best - currentKg) ? v : best
    );
    return nearest;
  }
  const nextIdx = idx + direction;
  if (nextIdx < 0) return sorted[0];
  if (nextIdx >= sorted.length) return sorted[sorted.length - 1];
  return sorted[nextIdx];
}

export function minWeight(steps: readonly number[]): number {
  return Math.min(...steps);
}

export function maxWeight(steps: readonly number[]): number {
  return Math.max(...steps);
}
