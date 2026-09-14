import type { AppData } from "../domain/types";
import { createInitialEquipment } from "../domain/equipment";
import { INITIAL_EXERCISES } from "../domain/exercises";
import { personalSettingsDefaults } from "../domain/proposalBuilder";

const STORAGE_KEY = "strength-app-data-v1";
export const CURRENT_SCHEMA_VERSION = 1;

export function createInitialAppData(): AppData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    equipment: createInitialEquipment(),
    exercises: INITIAL_EXERCISES,
    personalSettings: personalSettingsDefaults(),
    weightHistory: [],
    goalHistory: [],
    proposals: [],
    sessions: [],
    setRecords: [],
  };
}

export function loadAppData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialAppData();
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed.schemaVersion) return createInitialAppData();
    // 種目の定義(名称・フォーム等)は最新シードで補い、実績データは保持する。
    return {
      ...parsed,
      exercises: mergeExerciseSeed(parsed.exercises),
    };
  } catch {
    return createInitialAppData();
  }
}

function mergeExerciseSeed(existing: AppData["exercises"]): AppData["exercises"] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const seed of INITIAL_EXERCISES) {
    if (!byId.has(seed.id)) byId.set(seed.id, seed);
  }
  return [...byId.values()];
}

export function saveAppData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function exportAppDataAsJson(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  data?: AppData;
}

export function parseImportedJson(json: string): ImportResult {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.equipment) || !Array.isArray(parsed.exercises)) {
      return { ok: false, error: "データ形式が不正です。書き出したJSONファイルを指定してください。" };
    }
    return { ok: true, data: parsed as AppData };
  } catch {
    return { ok: false, error: "JSONの解析に失敗しました。ファイルが壊れている可能性があります。" };
  }
}
