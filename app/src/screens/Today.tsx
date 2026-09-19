import { newId } from "../domain/id";
import { useMemo, useState } from "react";
import { useAppData } from "../state/AppContext";
import { buildProposal, evaluateAvailability } from "../domain/proposalBuilder";
import { getDumbbell } from "../domain/equipment";
import { suggestBodyweight, suggestDumbbellProgression } from "../domain/suggestion";
import { formatGoalLabel, formatWeightLabel } from "../domain/format";
import type { Proposal, ProposalItem, SetRecord } from "../domain/types";

interface Props {
  onStartWorkout: () => void;
}

export function Today({ onStartWorkout }: Props) {
  const { data, addProposal, startSession } = useAppData();
  const uniqueMuscles = useMemo(
    () => [...new Set(data.exercises.map((e) => e.primaryMuscle))],
    [data.exercises]
  );
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(30);
  const [fatigue, setFatigue] = useState<"low" | "mid" | "high">("low");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [excludedReasons, setExcludedReasons] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setsByExercise = useMemo(() => {
    const map = new Map<string, SetRecord[]>();
    for (const s of data.setRecords) {
      if (s.deletedAt || s.isWarmup) continue;
      const list = map.get(s.exerciseId) ?? [];
      list.push(s);
      map.set(s.exerciseId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    }
    return map;
  }, [data.setRecords]);

  const availableForSwap = useMemo(() => {
    return evaluateAvailability(
      data.exercises,
      data.equipment,
      data.personalSettings.avoidMovements ?? [],
      setsByExercise
    )
      .filter((a) => a.available)
      .map((a) => a.exercise);
  }, [data.exercises, data.equipment, data.personalSettings.avoidMovements, setsByExercise]);

  function toggleMuscle(m: string) {
    setSelectedMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function handleBuildProposal() {
    setErrorMessage(null);
    try {
      const { proposal: p, excluded } = buildProposal({
        data,
        selectedMuscles,
        availableMinutes: minutes,
        now: new Date(),
      });
      setProposal(p);
      setExcludedReasons(excluded.map((e) => `${e.exercise.name}: ${e.unavailableReason ?? ""}`));
      if (p.items.length === 0) {
        setErrorMessage(
          "条件に合う種目がありません。選んだ部位・使える時間・避けたい種目の設定を見直してください。除外理由は下の一覧を確認できます。"
        );
      }
    } catch (e) {
      setProposal(null);
      setErrorMessage(`候補を作れませんでした: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function recomputeItem(exerciseId: string): ProposalItem {
    const exercise = data.exercises.find((e) => e.id === exerciseId)!;
    const goal = data.personalSettings.goalPrimary ?? "health";
    const history = setsByExercise.get(exerciseId) ?? [];
    const dumbbell = getDumbbell(data.equipment);
    if (exercise.loadType === "bodyweight") {
      const s = suggestBodyweight(exercise, goal, history);
      return {
        exerciseId,
        reps: s.reps,
        sets: s.sets,
        pieceCount: s.pieceCount,
        reason: s.reason,
        isInitialAdjustment: s.isInitialAdjustment,
      };
    }
    const s = suggestDumbbellProgression(exercise, goal, dumbbell?.weightStepsKg ?? [], history);
    return {
      exerciseId,
      reps: s.reps,
      sets: s.sets,
      weightKg: s.weightKg,
      pieceCount: s.pieceCount,
      reason: s.reason,
      isInitialAdjustment: s.isInitialAdjustment,
    };
  }

  function swapItem(index: number, newExerciseId: string) {
    if (!proposal) return;
    const newItem = recomputeItem(newExerciseId);
    const items = [...proposal.items];
    items[index] = newItem;
    setProposal({ ...proposal, items });
  }

  function handleStart() {
    if (!proposal) return;
    addProposal(proposal);
    const session = {
      id: newId(),
      startedAt: new Date().toISOString(),
      pausedIntervals: [],
      status: "active" as const,
      fatigue,
      proposalId: proposal.id,
    };
    startSession(session);
    onStartWorkout();
  }

  return (
    <div className="screen">
      <h2>今日の運動</h2>
      <section>
        <h3>部位(任意、複数選択可)</h3>
        <div className="chip-list">
          {uniqueMuscles.map((m) => (
            <button
              key={m}
              type="button"
              className={selectedMuscles.includes(m) ? "chip chip-selected" : "chip"}
              onClick={() => toggleMuscle(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </section>
      <section>
        <label>
          使える時間(分)
          <input
            type="number"
            min={5}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
      </section>
      <section>
        <label>
          今日の疲労
          <select value={fatigue} onChange={(e) => setFatigue(e.target.value as typeof fatigue)}>
            <option value="low">少ない</option>
            <option value="mid">普通</option>
            <option value="high">強い</option>
          </select>
        </label>
      </section>
      <p className="hint">目的: {formatGoalLabel(data.personalSettings.goalPrimary)}(設定画面で変更できます)</p>
      <button type="button" onClick={handleBuildProposal}>
        候補を作る
      </button>

      {errorMessage && (
        <p role="alert" className="error-message">
          {errorMessage}
        </p>
      )}

      {excludedReasons.length > 0 && (
        <details className="excluded-box">
          <summary>候補から除外した種目({excludedReasons.length})</summary>
          <ul>
            {excludedReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}

      {proposal && (
        <section>
          <h3>候補</h3>
          {proposal.items.length === 0 && <p>条件に合う種目がありません。部位や時間を変えてください。</p>}
          <ul className="proposal-list">
            {proposal.items.map((item, idx) => {
              const exercise = data.exercises.find((e) => e.id === item.exerciseId)!;
              return (
                <li key={item.exerciseId} className="proposal-item">
                  <div className="proposal-item-header">
                    <strong>{exercise.name}</strong>
                    <select
                      aria-label="種目交換"
                      value=""
                      onChange={(e) => e.target.value && swapItem(idx, e.target.value)}
                    >
                      <option value="">種目交換...</option>
                      {availableForSwap
                        .filter((e) => !proposal.items.some((it) => it.exerciseId === e.id))
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    {item.weightKg != null
                      ? formatWeightLabel(item.weightKg, item.pieceCount ?? exercise.defaultPieceCount)
                      : "自重"}
                    {" × "}
                    {item.reps}回 × {item.sets}セット
                  </div>
                  {item.isInitialAdjustment && <span className="badge">初回調整</span>}
                  <p className="reason">{item.reason}</p>
                  <p className="material-status">
                    教材: {exercise.materialStatus === "confirmed" ? "確認済み" : "未確認"}
                  </p>
                </li>
              );
            })}
          </ul>
          {proposal.items.length > 0 && (
            <button type="button" onClick={handleStart}>
              この内容で開始
            </button>
          )}
        </section>
      )}
    </div>
  );
}
