import { useMemo, useState } from "react";
import { useAppData } from "../state/AppContext";
import { newId } from "../domain/id";
import { exportAppDataAsJson, parseImportedJson } from "../storage/storage";
import { DUMBBELL_WEIGHT_STEPS_KG, getBench, getDumbbell } from "../domain/equipment";
import type { AppData, Experience, Goal } from "../domain/types";
import { Card, Field, FieldGroup, SectionTitle, Segmented, Sheet, Toast, Toggle } from "../components/ui";

function numberOrUndefined(v: string): number | undefined {
  return v === "" ? undefined : Number(v);
}

export function Settings() {
  const { data, updatePersonalSettings, updateEquipment, addWeightHistory, addGoalHistory, importData } = useAppData();
  const ps = data.personalSettings;
  const dumbbell = getDumbbell(data.equipment);
  const bench = getBench(data.equipment);
  const hasPushUpBar = data.equipment.some((e) => e.type === "pushUpBar");

  const [toast, setToast] = useState<string | null>(null);
  const [stepsText, setStepsText] = useState(dumbbell?.weightStepsKg.join(", ") ?? "");
  const [stepsError, setStepsError] = useState<string | null>(null);
  const [weight, setWeight] = useState("");
  const [weightDate, setWeightDate] = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [targetWeight, setTargetWeight] = useState("");
  const [pending, setPending] = useState<{ data: AppData; name: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const latestGoal = data.goalHistory[data.goalHistory.length - 1];
  const avoid = useMemo(() => ps.avoidMovements ?? [], [ps.avoidMovements]);

  function setEquipmentByType(type: "dumbbell" | "bench", patch: Record<string, unknown>) {
    updateEquipment(data.equipment.map((e) => (e.type === type ? ({ ...e, ...patch } as typeof e) : e)));
  }

  function applySteps(text: string) {
    const nums = text.split(/[,\s、]+/).filter(Boolean).map(Number);
    if (nums.length === 0 || nums.some((n) => !Number.isFinite(n) || n <= 0)) {
      setStepsError("正の数をカンマ区切りで入力してください（例: 3, 5, 7）。");
      return;
    }
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    setStepsError(null);
    setEquipmentByType("dumbbell", { weightStepsKg: sorted });
    setStepsText(sorted.join(", "));
    setToast(`重量一覧を${sorted.length}段階に更新しました`);
  }

  function exportData() {
    const blob = new Blob([exportAppDataAsJson(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `strength-app-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setToast("バックアップを書き出しました");
  }

  function readFile(file: File) {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseImportedJson(String(reader.result));
      if (!result.ok || !result.data) {
        setImportError(result.error ?? "取り込みに失敗しました。");
        return;
      }
      setPending({ data: result.data, name: file.name });
    };
    reader.readAsText(file);
  }

  return (
    <div className="screen">
      <SectionTitle>プロフィール</SectionTitle>
      <Card>
        <div className="field-row">
          <Field label="年齢">
            <input type="number" inputMode="numeric" value={ps.age ?? ""} onChange={(e) => updatePersonalSettings({ age: numberOrUndefined(e.target.value) })} />
          </Field>
          <Field label="身長 (cm)">
            <input type="number" inputMode="decimal" value={ps.heightCm ?? ""} onChange={(e) => updatePersonalSettings({ heightCm: numberOrUndefined(e.target.value) })} />
          </Field>
        </div>
        <FieldGroup label="主目的">
          <Segmented<Goal | "">
            label="主目的"
            value={ps.goalPrimary ?? ""}
            onChange={(v) => updatePersonalSettings({ goalPrimary: v || undefined })}
            options={[
              { value: "hypertrophy", label: "筋肥大" },
              { value: "fatloss", label: "減量" },
              { value: "strength", label: "筋力" },
              { value: "health", label: "健康維持" },
            ]}
          />
        </FieldGroup>
        <Field label="副目的（任意）">
          <input type="text" value={ps.goalSecondary ?? ""} onChange={(e) => updatePersonalSettings({ goalSecondary: e.target.value || undefined })} />
        </Field>
        <FieldGroup label="経験">
          <Segmented<Experience | "">
            label="経験"
            value={ps.experience ?? ""}
            onChange={(v) => updatePersonalSettings({ experience: v || undefined })}
            options={[
              { value: "beginner", label: "初心者" },
              { value: "intermediate", label: "経験あり" },
              { value: "advanced", label: "上級者" },
            ]}
          />
        </FieldGroup>
        <div className="field-row">
          <Field label="週の回数">
            <input type="number" inputMode="numeric" value={ps.frequencyPerWeek ?? ""} onChange={(e) => updatePersonalSettings({ frequencyPerWeek: numberOrUndefined(e.target.value) })} />
          </Field>
          <Field label="1回の時間 (分)">
            <input type="number" inputMode="numeric" value={ps.sessionMinutes ?? ""} onChange={(e) => updatePersonalSettings({ sessionMinutes: numberOrUndefined(e.target.value) })} />
          </Field>
        </div>
        <p className="muted">入力内容はこの端末にだけ保存され、変更すると自動で反映されます。</p>
      </Card>

      <SectionTitle>体重と目標</SectionTitle>
      <Card>
        <div className="field-row">
          <Field label="日付">
            <input type="date" value={weightDate} onChange={(e) => setWeightDate(e.target.value)} />
          </Field>
          <Field label="体重 (kg)">
            <input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!weight || Number(weight) <= 0}
          onClick={() => {
            addWeightHistory({ id: newId(), date: weightDate, weightKg: Number(weight), recordedAt: new Date().toISOString() });
            setWeight("");
            setToast("体重を記録しました");
          }}
        >
          体重を記録
        </button>
        <Field label="目標体重 (kg)" hint="空欄のまま保存すると「現状維持」になります。">
          <input type="number" inputMode="decimal" step="0.1" value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} />
        </Field>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            addGoalHistory({
              id: newId(),
              maintain: targetWeight === "",
              targetWeightKg: targetWeight === "" ? undefined : Number(targetWeight),
              goalPrimary: ps.goalPrimary ?? "health",
              setAt: new Date().toISOString(),
            });
            setTargetWeight("");
            setToast("目標を保存しました");
          }}
        >
          目標を保存
        </button>
        {latestGoal && (
          <p className="muted" data-testid="current-goal">
            現在の目標：{latestGoal.maintain ? "現状維持" : `${latestGoal.targetWeightKg}kg`}
          </p>
        )}
      </Card>

      <SectionTitle>器具</SectionTitle>
      <Card>
        <h3>可変式ダンベル（{dumbbell?.name}）</h3>
        <Field label="個数">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={dumbbell?.count ?? 2}
            onChange={(e) => setEquipmentByType("dumbbell", { count: Math.max(1, Number(e.target.value) || 1) })}
          />
        </Field>
        <div className="field">
          <span className="field-label">片手あたりの利用可能重量（{dumbbell?.weightStepsKg.length}段階）</span>
          <div className="weight-chips" data-testid="weight-steps">
            {dumbbell?.weightStepsKg.map((w) => (
              <span key={w} className="badge badge-info">
                {w}kg
              </span>
            ))}
          </div>
        </div>
        <details className="details">
          <summary>重量一覧を編集する</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            <Field label="重量（kg、カンマ区切り）" hint="本人の申告に基づく値だけを入力してください。">
              <input type="text" value={stepsText} onChange={(e) => setStepsText(e.target.value)} />
            </Field>
            {stepsError && <p role="alert" className="badge badge-danger">{stepsError}</p>}
            <div className="card-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => applySteps(stepsText)}>
                この内容で更新
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => applySteps(DUMBBELL_WEIGHT_STEPS_KG.join(", "))}>
                初期の16段階に戻す
              </button>
            </div>
          </div>
        </details>
      </Card>

      <Card>
        <h3>ベンチ（{bench?.name}）</h3>
        <Toggle
          label="角度調整の仕様を確認済み"
          pressed={bench?.angleConfirmed ?? false}
          onChange={(v) => setEquipmentByType("bench", { angleConfirmed: v })}
        />
        {!bench?.angleConfirmed && (
          <p className="muted">仕様が未確認のため、角度の指定が必要な種目（インクライン等）は候補に出しません。</p>
        )}
      </Card>

      <Card>
        <h3>プッシュバー</h3>
        <Toggle
          label="保有している"
          pressed={hasPushUpBar}
          onChange={(v) =>
            updateEquipment(
              v
                ? [...data.equipment, { id: "eq-pushupbar", type: "pushUpBar", name: "プッシュバー" }]
                : data.equipment.filter((e) => e.type !== "pushUpBar")
            )
          }
        />
      </Card>

      <SectionTitle>避けたい種目</SectionTitle>
      <Card>
        <p className="muted">選んだ種目は、自動の候補に出しません。</p>
        <div className="chips" role="group" aria-label="避けたい種目">
          {data.exercises.map((e) => (
            <button
              key={e.id}
              type="button"
              className="chip chip-danger"
              aria-pressed={avoid.includes(e.id)}
              onClick={() =>
                updatePersonalSettings({ avoidMovements: avoid.includes(e.id) ? avoid.filter((x) => x !== e.id) : [...avoid, e.id] })
              }
            >
              {e.name}
            </button>
          ))}
        </div>
      </Card>

      <SectionTitle>データの書き出し・復元</SectionTitle>
      <Card>
        <p className="muted">記録はこの端末のブラウザ内に保存されます。定期的に書き出しておくと、機種変更や消去に備えられます。</p>
        <button type="button" className="btn btn-block" onClick={exportData}>
          データを書き出す
        </button>
        <label className="btn btn-secondary btn-block" style={{ cursor: "pointer" }}>
          バックアップから復元する
          <input
            type="file"
            accept="application/json,.json"
            data-testid="import-file"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {importError && (
          <p role="alert" className="badge badge-danger">
            {importError}
          </p>
        )}
      </Card>

      <Sheet title="バックアップを復元" open={pending !== null} onClose={() => setPending(null)}>
        <p className="lead">
          「{pending?.name}」を読み込みます。<strong>現在のデータはすべて置き換えられます。</strong>
        </p>
        <button
          type="button"
          className="btn btn-block btn-lg"
          onClick={() => {
            if (pending) importData(pending.data);
            setPending(null);
            setToast("復元しました");
          }}
        >
          復元する
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => setPending(null)}>
          キャンセル
        </button>
      </Sheet>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
