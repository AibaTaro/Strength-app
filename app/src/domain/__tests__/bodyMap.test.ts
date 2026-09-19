import { describe, expect, it } from "vitest";
import { BODY_GROUPS, muscleNamesOf } from "../bodyMap";
import { INITIAL_EXERCISES } from "../exercises";

describe("人体図の部位", () => {
  it("全種目の主対象部位が、いずれかの人体図の部位から選べる", () => {
    const selectable = new Set(BODY_GROUPS.flatMap((g) => g.names));
    for (const e of INITIAL_EXERCISES) expect(selectable.has(e.primaryMuscle), `${e.name}: ${e.primaryMuscle}`).toBe(true);
  });
  it("部位idから筋肉名へ変換できる", () => {
    expect(muscleNamesOf(["chest"])).toEqual(["大胸筋", "大胸筋上部"]);
    expect(muscleNamesOf([])).toEqual([]);
  });
  it("各部位は前面か背面のいずれかで表示される", () => {
    for (const g of BODY_GROUPS) expect(g.views.length).toBeGreaterThan(0);
  });
});

import { describeAutoPick, suggestGroups } from "../bodyMap";

describe("おまかせ(最も空いている部位)", () => {
  const ex = INITIAL_EXERCISES;
  const now = new Date("2026-09-20T03:00:00Z");
  const set = (exerciseId: string, daysAgo: number, extra = {}) => ({
    exerciseId,
    completedAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
    isWarmup: false,
    ...extra,
  });

  it("記録がなければ、未実施の部位を並び順で選ぶ", () => {
    const picks = suggestGroups([], ex, now);
    expect(picks.map((p) => p.id)).toEqual(["chest", "shoulder"]);
    expect(picks.every((p) => p.days === null)).toBe(true);
  });

  it("最近鍛えた部位は避け、最も日数が空いた部位を選ぶ", () => {
    // 胸(ベンチプレス)を1日前、肩を10日前、他は未実施 → 未実施が優先され、実施済みでは肩が先
    const picks = suggestGroups([set("dumbbell-bench-press", 1), set("dumbbell-shoulder-press", 10)], ex, now, 9);
    const ids = picks.map((p) => p.id);
    expect(ids.indexOf("shoulder")).toBeLessThan(ids.indexOf("chest"));
    expect(ids.slice(-2)).toEqual(["shoulder", "chest"]);
  });

  it("準備セットと削除済みのセットは数えない", () => {
    const picks = suggestGroups([set("dumbbell-bench-press", 0, { isWarmup: true }), set("dumbbell-bench-press", 0, { deletedAt: "x" })], ex, now);
    expect(picks[0]).toMatchObject({ id: "chest", days: null });
  });

  it("説明文を作れる", () => {
    expect(describeAutoPick([{ id: "chest", label: "胸", days: null }, { id: "glute", label: "お尻", days: 5 }])).toBe("おまかせ：胸（まだ記録なし）・お尻（5日ぶり）");
  });
});
