import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialAppData, exportAppDataAsJson, loadAppData, parseImportedJson, saveAppData } from "../storage";
import type { SetRecord } from "../../domain/types";

// vitestのnode環境にはlocalStorageがないため、テスト用の簡易実装を用意する。
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

describe("書き出し・復元の往復", () => {
  it("器具、単位、個数、左右がJSONの往復で一致する", () => {
    const data = createInitialAppData();
    const record: SetRecord = {
      id: "r1",
      sessionId: "sess1",
      exerciseId: "dumbbell-one-arm-row",
      order: 0,
      side: "left",
      weightKg: 12,
      pieceCount: 1,
      reps: 10,
      effort: "2",
      pain: false,
      isWarmup: false,
      completedAt: new Date().toISOString(),
      updatedVersion: 1,
    };
    data.setRecords.push(record);

    const json = exportAppDataAsJson(data);
    const result = parseImportedJson(json);

    expect(result.ok).toBe(true);
    expect(result.data?.equipment).toEqual(data.equipment);
    expect(result.data?.setRecords[0].side).toBe("left");
    expect(result.data?.setRecords[0].pieceCount).toBe(1);
    expect(result.data?.setRecords[0].weightKg).toBe(12);

    const dumbbell = result.data?.equipment.find((e) => e.type === "dumbbell");
    expect(dumbbell && "weightStepsKg" in dumbbell ? dumbbell.weightStepsKg : []).toHaveLength(16);
  });

  it("不正なJSONはエラーとして扱う", () => {
    const result = parseImportedJson("not json");
    expect(result.ok).toBe(false);
  });
});

describe("再読込後の保持(localStorage)", () => {
  it("1セットを確定して保存し、再読込(loadAppData再実行)しても保持される", () => {
    const data = createInitialAppData();
    const record: SetRecord = {
      id: "r1",
      sessionId: "sess1",
      exerciseId: "goblet-squat",
      order: 0,
      side: "na",
      weightKg: 12,
      pieceCount: 1,
      reps: 10,
      effort: "2",
      pain: false,
      isWarmup: false,
      completedAt: new Date().toISOString(),
      updatedVersion: 1,
    };
    data.setRecords.push(record);
    saveAppData(data);

    // 「再読込」を模して、保存関数を経由せず改めてloadAppDataを呼ぶ
    const reloaded = loadAppData();
    expect(reloaded.setRecords).toHaveLength(1);
    expect(reloaded.setRecords[0]).toEqual(record);
  });
});
