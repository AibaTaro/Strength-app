import { useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "../state/AppContext";
import { activeIntervalsOfSession } from "../domain/aggregation";
import { formatDurationMs, formatEffortLabel, formatSideLabel, formatWeightLabel } from "../domain/format";
import { getDumbbell } from "../domain/equipment";
import { REST_SECONDS_BY_GOAL } from "../domain/proposalBuilder";
import { WeightStepPicker } from "../components/WeightStepPicker";
import type { Effort, Exercise, Goal, ProposalItem, Side, SetRecord } from "../domain/types";

function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface SetFormState {
  weightKg: number;
  pieceCount: 1 | 2;
  side: Side;
  reps: number;
  effort: Effort;
  pain: boolean;
  isWarmup: boolean;
}

function defaultFormFor(exercise: Exercise, dumbbellSteps: readonly number[], prefillWeight?: number, prefillReps?: number): SetFormState {
  const pieceCount = exercise.defaultPieceCount;
  const side: Side = exercise.unilateral ? "left" : pieceCount === 2 ? "both" : "na";
  return {
    weightKg: exercise.loadType === "dumbbellPerHand" ? prefillWeight ?? dumbbellSteps[0] ?? 3 : 0,
    pieceCount,
    side,
    reps: prefillReps ?? 8,
    effort: "unknown",
    pain: false,
    isWarmup: false,
  };
}

function ExercisePanel({
  exercise,
  sessionId,
  goal,
  proposalItem,
}: {
  exercise: Exercise;
  sessionId: string;
  goal: Goal;
  proposalItem?: ProposalItem;
  }) {
  const { data, addSetRecord, updateSetRecord, deleteSetRecord } = useAppData();
  const dumbbell = getDumbbell(data.equipment);
  const steps = dumbbell?.weightStepsKg ?? [];

  const priorHistory = useMemo(
    () =>
      data.setRecords
        .filter((s) => s.exerciseId === exercise.id && !s.deletedAt && s.sessionId !== sessionId)
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()),
    [data.setRecords, exercise.id, sessionId]
  );

  const setsInSession = useMemo(
    () =>
      data.setRecords
        .filter((s) => s.exerciseId === exercise.id && s.sessionId === sessionId && !s.deletedAt)
        .sort((a, b) => a.order - b.order),
    [data.setRecords, exercise.id, sessionId]
  );

  const [form, setForm] = useState<SetFormState>(() =>
    defaultFormFor(
      exercise,
      steps,
      priorHistory[0]?.weightKg ?? proposalItem?.weightKg,
      priorHistory[0]?.reps ?? proposalItem?.reps
    )
  );
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const now = useNowTick(1000);

  const restRemainingSec = restUntil ? Math.max(0, Math.ceil((restUntil - now) / 1000)) : 0;

  function resetForm() {
    setForm(
      defaultFormFor(
        exercise,
        steps,
        priorHistory[0]?.weightKg ?? proposalItem?.weightKg,
        priorHistory[0]?.reps ?? proposalItem?.reps
      )
    );
    setEditingId(null);
  }

  function handleConfirm() {
    // refで同期的にガードする(二重タップ対策)。state更新は再描画まで反映されないため
    // stateだけのガードでは連続クリックを取りこぼす。
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (editingId) {
        updateSetRecord(editingId, {
          weightKg: exercise.loadType === "dumbbellPerHand" ? form.weightKg : null,
          pieceCount: form.pieceCount,
          side: form.side,
          reps: form.reps,
          effort: form.effort,
          pain: form.pain,
          isWarmup: form.isWarmup,
        });
      } else {
        const record: SetRecord = {
          id: crypto.randomUUID(),
          sessionId,
          exerciseId: exercise.id,
          order: setsInSession.length,
          side: form.side,
          weightKg: exercise.loadType === "dumbbellPerHand" ? form.weightKg : null,
          pieceCount: form.pieceCount,
          reps: form.reps,
          effort: form.effort,
          pain: form.pain,
          isWarmup: form.isWarmup,
          completedAt: new Date().toISOString(),
          updatedVersion: 1,
        };
        addSetRecord(record);
        if (!form.isWarmup) {
          setRestUntil(Date.now() + REST_SECONDS_BY_GOAL[goal] * 1000);
        }
      }
      resetForm();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function startEdit(s: SetRecord) {
    setEditingId(s.id);
    setForm({
      weightKg: s.weightKg ?? steps[0] ?? 3,
      pieceCount: s.pieceCount,
      side: s.side,
      reps: s.reps,
      effort: s.effort,
      pain: s.pain,
      isWarmup: s.isWarmup,
    });
  }

  return (
    <div className="exercise-panel">
      <h4>{exercise.name}</h4>
      {setsInSession.length > 0 && (
        <ul className="set-history">
          {setsInSession.map((s) => (
            <li key={s.id}>
              {formatWeightLabel(s.weightKg, s.pieceCount)} × {s.reps}回 [{formatSideLabel(s.side)}]
              {s.isWarmup && <span className="badge">準備</span>}
              {s.pain && <span className="badge badge-pain">痛み</span>}
              <button type="button" onClick={() => startEdit(s)}>
                編集
              </button>
              <button type="button" onClick={() => deleteSetRecord(s.id)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      {restUntil && restRemainingSec > 0 && (
        <p className="rest-timer">
          休憩中: 残り{restRemainingSec}秒
          <button type="button" onClick={() => setRestUntil(null)}>
            休憩終了
          </button>
        </p>
      )}

      <div className="set-form">
        {exercise.loadType === "dumbbellPerHand" && (
          <div>
            <label>重量(1個あたり)</label>
            <WeightStepPicker
              steps={steps}
              valueKg={form.weightKg}
              onChange={(weightKg) => setForm((f) => ({ ...f, weightKg }))}
            />
            {!exercise.unilateral && (
              <label>
                使用個数
                <select
                  value={form.pieceCount}
                  onChange={(e) => {
                    const pieceCount = Number(e.target.value) as 1 | 2;
                    setForm((f) => ({ ...f, pieceCount, side: pieceCount === 2 ? "both" : "na" }));
                  }}
                >
                  <option value={1}>1個(両手で保持)</option>
                  <option value={2}>2個</option>
                </select>
              </label>
            )}
          </div>
        )}
        {exercise.unilateral && (
          <label>
            左右
            <select value={form.side} onChange={(e) => setForm((f) => ({ ...f, side: e.target.value as Side }))}>
              <option value="left">左</option>
              <option value="right">右</option>
            </select>
          </label>
        )}
        <label>
          回数
          <input
            type="number"
            min={1}
            value={form.reps}
            onChange={(e) => setForm((f) => ({ ...f, reps: Number(e.target.value) }))}
          />
        </label>
        <label>
          余力
          <select value={form.effort} onChange={(e) => setForm((f) => ({ ...f, effort: e.target.value as Effort }))}>
            {(["0", "1", "2", "3+", "unknown"] as Effort[]).map((v) => (
              <option key={v} value={v}>
                {formatEffortLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.pain}
            onChange={(e) => setForm((f) => ({ ...f, pain: e.target.checked }))}
          />
          痛みがある
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.isWarmup}
            onChange={(e) => setForm((f) => ({ ...f, isWarmup: e.target.checked }))}
          />
          準備セット
        </label>
        <button type="button" disabled={submitting} onClick={handleConfirm}>
          {editingId ? "更新する" : "このセットを確定"}
        </button>
        {editingId && (
          <button type="button" onClick={resetForm}>
            編集をやめる
          </button>
        )}
      </div>
    </div>
  );
}

export function Workout({ onEnd }: { onEnd: () => void }) {
  const { data, updateSession } = useAppData();
  const session = useMemo(
    () => data.sessions.find((s) => s.status === "active" || s.status === "paused"),
    [data.sessions]
  );
  const now = useNowTick(1000);
  const [manualExerciseId, setManualExerciseId] = useState("");

  const proposal = useMemo(
    () => (session?.proposalId ? data.proposals.find((p) => p.id === session.proposalId) : undefined),
    [data.proposals, session]
  );

  const [addedExerciseIds, setAddedExerciseIds] = useState<string[]>([]);

  const exerciseIdsToShow = useMemo(() => {
    const fromProposal = proposal?.items.map((i) => i.exerciseId) ?? [];
    const fromSets = session
      ? [...new Set(data.setRecords.filter((s) => s.sessionId === session.id && !s.deletedAt).map((s) => s.exerciseId))]
      : [];
    return [...new Set([...fromProposal, ...fromSets, ...addedExerciseIds])];
  }, [proposal, session, data.setRecords, addedExerciseIds]);

  if (!session) {
    return (
      <div className="screen">
        <h2>運動中</h2>
        <p>アクティブなセッションがありません。「今日」タブから開始してください。</p>
      </div>
    );
  }

  const elapsedMs = activeIntervalsOfSession(session, now).reduce((sum, [a, b]) => sum + (b - a), 0);
  const goal = data.personalSettings.goalPrimary ?? "health";

  function handlePauseResume() {
    if (!session) return;
    if (session.status === "active") {
      updateSession(session.id, {
        status: "paused",
        pausedIntervals: [...session.pausedIntervals, { start: new Date().toISOString() }],
      });
    } else {
      const intervals = [...session.pausedIntervals];
      const last = intervals[intervals.length - 1];
      if (last && !last.end) last.end = new Date().toISOString();
      updateSession(session.id, { status: "active", pausedIntervals: intervals });
    }
  }

  function handleEnd() {
    if (!session) return;
    updateSession(session.id, { status: "completed", endedAt: new Date().toISOString() });
    onEnd();
  }

  const availableToAdd = data.exercises.filter((e) => !exerciseIdsToShow.includes(e.id));

  return (
    <div className="screen">
      <h2>運動中</h2>
      <p className="session-timer">
        経過時間: {formatDurationMs(elapsedMs)}({session.status === "paused" ? "一時停止中" : "実施中"})
      </p>
      <div className="session-controls">
        <button type="button" onClick={handlePauseResume}>
          {session.status === "active" ? "一時停止" : "再開"}
        </button>
        <button type="button" onClick={handleEnd}>
          セッション終了
        </button>
      </div>

      {exerciseIdsToShow.map((id) => {
        const exercise = data.exercises.find((e) => e.id === id);
        if (!exercise) return null;
        const proposalItem = proposal?.items.find((i) => i.exerciseId === id);
        return (
          <ExercisePanel
            key={id}
            exercise={exercise}
            sessionId={session.id}
            goal={goal}
            proposalItem={proposalItem}
          />
        );
      })}

      <div className="add-exercise">
        <select value={manualExerciseId} onChange={(e) => setManualExerciseId(e.target.value)}>
          <option value="">種目を追加(手動選択)...</option>
          {availableToAdd.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!manualExerciseId}
          onClick={() => {
            setAddedExerciseIds((prev) => [...prev, manualExerciseId]);
            setManualExerciseId("");
          }}
        >
          追加
        </button>
      </div>
    </div>
  );
}
