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
