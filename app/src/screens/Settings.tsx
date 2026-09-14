import { useRef, useState } from "react";
import { useAppData } from "../state/AppContext";
import { exportAppDataAsJson, parseImportedJson } from "../storage/storage";
import { getBench, getDumbbell } from "../domain/equipment";
import type { BenchEquipment, DumbbellEquipment, Equipment, Goal } from "../domain/types";

export function Settings() {
  const { data, updatePersonalSettings, updateEquipment, addWeightHistory, addGoalHistory, importData } =
    useAppData();
  const dumbbell = getDumbbell(data.equipment);
  const bench = getBench(data.equipment);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const [weightStepsText, setWeightStepsText] = useState(dumbbell?.weightStepsKg.join(",") ?? "");
  const [newWeightKg, setNewWeightKg] = useState("");
  const [newWeightDate, setNewWeightDate] = useState(() => new Date().toISOString().slice(0, 10));

  function updateDumbbell(patch: Partial<DumbbellEquipment>) {
    updateEquipment(
      data.equipment.map((e) => (e.type === "dumbbell" ? { ...e, ...patch } : e))
    );
  }
  function updateBench(patch: Partial<BenchEquipment>) {
    updateEquipment(data.equipment.map((e) => (e.type === "bench" ? { ...e, ...patch } : e)));
  }

  function applyWeightSteps() {
    const parsed = weightStepsText
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (parsed.length === 0) return;
    updateDumbbell({ weightStepsKg: [...new Set(parsed)].sort((a, b) => a - b) });
  }

  function handleExport() {
    const json = exportAppDataAsJson(data);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `strength-app-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseImportedJson(String(reader.result));
      if (!result.ok || !result.data) {
        setImportMessage(result.error ?? "取り込みに失敗しました。");
        return;
      }
      importData(result.data);
      setImportMessage("復元しました。");
    };
    reader.readAsText(file);
  }

  const avoidMovements = data.personalSettings.avoidMovements ?? [];
  function toggleAvoid(exerciseId: string) {
    const next = avoidMovements.includes(exerciseId)
      ? avoidMovements.filter((id) => id !== exerciseId)
      : [...avoidMovements, exerciseId];
    updatePersonalSettings({ avoidMovements: next });
  }

  return (
    <div className="screen">
      <h2>個人設定</h2>
      <section>
        <label>
          年齢
          <input
            type="number"
            value={data.personalSettings.age ?? ""}
            onChange={(e) => updatePersonalSettings({ age: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
        <label>
          身長(cm)
          <input
            type="number"
            value={data.personalSettings.heightCm ?? ""}
            onChange={(e) =>
              updatePersonalSettings({ heightCm: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </label>
        <label>
          主目的
          <select
            value={data.personalSettings.goalPrimary ?? ""}
            onChange={(e) => updatePersonalSettings({ goalPrimary: (e.target.value || undefined) as Goal })}
          >
            <option value="">未設定</option>
            <option value="hypertrophy">筋肥大</option>
            <option value="fatloss">減量</option>
            <option value="strength">筋力向上</option>
            <option value="health">健康維持</option>
          </select>
        </label>
        <label>
          副目的(任意)
          <input
            type="text"
            value={data.personalSettings.goalSecondary ?? ""}
            onChange={(e) => updatePersonalSettings({ goalSecondary: e.target.value || undefined })}
          />
        </label>
        <label>
          経験
          <select
            value={data.personalSettings.experience ?? ""}
            onChange={(e) =>
              updatePersonalSettings({ experience: (e.target.value || undefined) as "beginner" | "intermediate" | "advanced" | undefined })
            }
          >
            <option value="">未設定</option>
            <option value="beginner">初心者</option>
            <option value="intermediate">経験あり</option>
            <option value="advanced">上級者</option>
          </select>
        </label>
        <label>
          週の頻度(回)
          <input
            type="number"
            value={data.personalSettings.frequencyPerWeek ?? ""}
            onChange={(e) =>
              updatePersonalSettings({ frequencyPerWeek: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </label>
        <label>
          1回の所要時間(分)
          <input
            type="number"
            value={data.personalSettings.sessionMinutes ?? ""}
            onChange={(e) =>
              updatePersonalSettings({ sessionMinutes: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </label>
      </section>

      <section>
        <h3>避けたい種目</h3>
        <div className="chip-list">
          {data.exercises.map((e) => (
            <button
              key={e.id}
              type="button"
              className={avoidMovements.includes(e.id) ? "chip chip-selected" : "chip"}
              onClick={() => toggleAvoid(e.id)}
            >
              {e.name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>体重記録</h3>
        <label>
          日付
          <input type="date" value={newWeightDate} onChange={(e) => setNewWeightDate(e.target.value)} />
        </label>
        <label>
          体重(kg)
          <input type="number" step="0.1" value={newWeightKg} onChange={(e) => setNewWeightKg(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={!newWeightKg}
          onClick={() => {
            addWeightHistory({
              id: crypto.randomUUID(),
              date: newWeightDate,
              weightKg: Number(newWeightKg),
              recordedAt: new Date().toISOString(),
            });
            setNewWeightKg("");
          }}
        >
          記録する
        </button>
      </section>

      <section>
        <h3>目標</h3>
        <button
          type="button"
          onClick={() =>
            addGoalHistory({
              id: crypto.randomUUID(),
              maintain: true,
              goalPrimary: data.personalSettings.goalPrimary ?? "health",
              setAt: new Date().toISOString(),
            })
          }
        >
          「現状維持」を目標に設定
        </button>
        {data.goalHistory.length > 0 && (
          <p>
            現在の目標:{" "}
            {data.goalHistory[data.goalHistory.length - 1].maintain
              ? "維持"
              : `${data.goalHistory[data.goalHistory.length - 1].targetWeightKg}kg`}
          </p>
        )}
      </section>

      <h2>器具設定</h2>
      <section>
        <h3>ダンベル({dumbbell?.name})</h3>
        <label>
          個数
          <input
            type="number"
            min={1}
            value={dumbbell?.count ?? 2}
            onChange={(e) => updateDumbbell({ count: Number(e.target.value) })}
          />
        </label>
        <label>
          利用可能重量(kg、カンマ区切り、片手あたり)
          <input value={weightStepsText} onChange={(e) => setWeightStepsText(e.target.value)} />
        </label>
        <button type="button" onClick={applyWeightSteps}>
          重量一覧を更新
        </button>
        <p className="hint">初期値は16段階(3,5,7,9,12,14,16,18,21,23,25,27,30,32,34,36)です。変更は本人の申告に基づいてください。</p>
      </section>
      <section>
        <h3>ベンチ({bench?.name})</h3>
        <label>
          <input
            type="checkbox"
            checked={bench?.angleConfirmed ?? false}
            onChange={(e) => updateBench({ angleConfirmed: e.target.checked })}
          />
          角度調整の仕様を確認済みにする
        </label>
        {!bench?.angleConfirmed && (
          <p className="hint">未確認のため、角度指定が必要な種目(インクラインベンチプレス等)は提案候補から除外されます。</p>
        )}
      </section>
      <section>
        <h3>プッシュバー</h3>
        <label>
          <input
            type="checkbox"
            checked={data.equipment.some((e) => e.type === "pushUpBar")}
            onChange={(e) => {
              const has = data.equipment.some((eq) => eq.type === "pushUpBar");
              if (e.target.checked && !has) {
                const next: Equipment[] = [...data.equipment, { id: "eq-pushupbar", type: "pushUpBar", name: "プッシュバー" }];
                updateEquipment(next);
              } else if (!e.target.checked && has) {
                updateEquipment(data.equipment.filter((eq) => eq.type !== "pushUpBar"));
              }
            }}
          />
          プッシュバーを保有している
        </label>
      </section>

      <h2>データ管理(書き出し・復元)</h2>
      <section>
        <button type="button" onClick={handleExport}>
          データを書き出す(JSONダウンロード)
        </button>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
            }}
          />
        </div>
        {importMessage && <p>{importMessage}</p>}
        <p className="hint">復元は現在のデータをすべて置き換えます。</p>
      </section>
    </div>
  );
}
