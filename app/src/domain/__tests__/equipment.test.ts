import { describe, expect, it } from "vitest";
import { DUMBBELL_WEIGHT_STEPS_KG, createInitialEquipment, stepWeight, maxWeight, minWeight } from "../equipment";

describe("初期器具", () => {
  it("3種類の器具、ダンベル2個、16段階の重量が登録される", () => {
    const equipment = createInitialEquipment();
    expect(equipment).toHaveLength(3);
    const dumbbell = equipment.find((e) => e.type === "dumbbell");
    expect(dumbbell?.count).toBe(2);
    expect(dumbbell && "weightStepsKg" in dumbbell ? dumbbell.weightStepsKg : []).toEqual([
      3, 5, 7, 9, 12, 14, 16, 18, 21, 23, 25, 27, 30, 32, 34, 36,
    ]);
    expect(DUMBBELL_WEIGHT_STEPS_KG).toHaveLength(16);
  });

  it("ベンチは角度未確認、プッシュバーが登録される", () => {
    const equipment = createInitialEquipment();
    const bench = equipment.find((e) => e.type === "bench");
    expect(bench && "angleConfirmed" in bench ? bench.angleConfirmed : true).toBe(false);
    expect(equipment.some((e) => e.type === "pushUpBar")).toBe(true);
  });
});

describe("重量の+/-操作", () => {
  const steps = DUMBBELL_WEIGHT_STEPS_KG;

  it("9kgの次は12kgで、11kgは生成しない", () => {
    expect(stepWeight(steps, 9, 1)).toBe(12);
  });

  it("18kgの次は21kg、27kgの次は30kg", () => {
    expect(stepWeight(steps, 18, 1)).toBe(21);
    expect(stepWeight(steps, 27, 1)).toBe(30);
  });

  it("最小(3kg)から下げても3kgのまま", () => {
    expect(stepWeight(steps, 3, -1)).toBe(3);
    expect(minWeight(steps)).toBe(3);
  });

  it("最大(36kg)から上げても36kgのまま", () => {
    expect(stepWeight(steps, 36, 1)).toBe(36);
    expect(maxWeight(steps)).toBe(36);
  });

  it("登録された16段階以外の値を生成しない", () => {
    for (let i = 0; i < steps.length - 1; i++) {
      const next = stepWeight(steps, steps[i], 1);
      expect(steps).toContain(next);
    }
  });
});
