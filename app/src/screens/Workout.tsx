import { useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "../state/AppContext";
import { newId } from "../domain/id";
import { activeIntervalsOfSession } from "../domain/aggregation";
import { formatClock, formatEffortLabel, formatSideLabel } from "../domain/format";
import { getDumbbell } from "../domain/equipment";
import { REST_SECONDS_BY_GOAL, evaluateAvailability, groupSetsByExercise } from "../domain/proposalBuilder";
import { WeightStepPicker } from "../components/WeightStepPicker";
import { Card, EmptyState, Icon, Segmented, Sheet, Toast, Toggle } from "../components/ui";
import { MotionGuide } from "../components/MotionGuide";
import type { CSSProperties } from "react";
import type { Effort, Exercise, Goal, ProposalItem, SetRecord, Side, WorkoutSession } from "../domain/types";

function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface FormState {
  weightKg: number;
  pieceCount: 1 | 2;
  side: Side;
  reps: number;
  effort: Effort;
  pain: boolean;
  isWarmup: boolean;
}

function initialForm(
  exercise: Exercise,
  steps: readonly number[],
  weight?: number | null,
  reps?: number
): FormState {
  const pieceCount = exercise.defaultPieceCount;
  return {
    weightKg: exercise.loadType === "dumbbellPerHand" ? (weight ?? steps[0] ?? 3) : 0,
    pieceCount,
    side: exercise.unilateral ? "left" : pieceCount === 2 ? "both" : "na",
    reps: reps ?? 10,
    effort: "unknown",
    pain: false,
    isWarmup: false,
  };
}

interface PanelProps {
  exercise: Exercise;
  session: WorkoutSession;
  goal: Goal;
  proposalItem?: ProposalItem;
  open: boolean;
  onToggle: () => void;
  onSetAdded: (restSeconds: number | null, finishedExercise: boolean) => void;
  onSetDeleted: (id: string) => void;
}

function ExercisePanel({ exercise, session, goal, proposalItem, open, onToggle, onSetAdded, onSetDeleted }: PanelProps) {
  const { data, addSetRecord, updateSetRecord, deleteSetRecord } = useAppData();
  const steps = getDumbbell(data.equipment)?.weightStepsKg ?? [];

  const previous = useMemo(
    () => groupSetsByExercise(data.setRecords.filter((s) => s.sessionId !== session.id)).get(exercise.id)?.[0],
    [data.setRecords, session.id, exercise.id]
  );
  const setsHere = useMemo(
    () =>
      data.setRecords
        .filter((s) => s.exerciseId === exercise.id && s.sessionId === session.id && !s.deletedAt)
        .sort((a, b) => a.order - b.order),
    [data.setRecords, exercise.id, session.id]
  );
  const workingCount = setsHere.filter((s) => !s.isWarmup).length;
  const targetSets = proposalItem?.sets;

  const [form, setForm] = useState<FormState>(() =>
    initialForm(exercise, steps, proposalItem?.weightKg ?? previous?.weightKg, proposalItem?.reps ?? previous?.reps)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const busy = useRef(false);

  const done = targetSets != null && workingCount >= targetSets;
  const isDumbbell = exercise.loadType === "dumbbellPerHand";

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function confirm() {
    const weightKg = isDumbbell ? form.weightKg : null;
    if (editingId) {
      updateSetRecord(editingId, {
        weightKg,
        pieceCount: form.pieceCount,
        side: form.side,
        reps: form.reps,
        effort: form.effort,
        pain: form.pain,
        isWarmup: form.isWarmup,
      });
      setEditingId(null);
      patch({ pain: false, isWarmup: false, effort: "unknown" });
      return;
    }
    // 二重タップ対策(新規追加のみ): stateは再描画まで反映されないためrefで同期的にガードする。
    // 編集は同じ内容の再適用になるだけなのでガード不要。
    if (busy.current) return;
    busy.current = true;
    setTimeout(() => (busy.current = false), 350);
    addSetRecord({
      id: newId(),
      sessionId: session.id,
      exerciseId: exercise.id,
      order: setsHere.length,
      side: form.side,
      weightKg,
      pieceCount: form.pieceCount,
      reps: form.reps,
      effort: form.effort,
      pain: form.pain,
      isWarmup: form.isWarmup,
      completedAt: new Date().toISOString(),
      updatedVersion: 1,
    });
    const finished = !form.isWarmup && targetSets != null && workingCount + 1 >= targetSets;
    onSetAdded(form.isWarmup ? null : REST_SECONDS_BY_GOAL[goal], finished);
    patch({
      pain: false,
      isWarmup: false,
      effort: "unknown",
      side: exercise.unilateral ? (form.side === "left" ? "right" : "left") : form.side,
    });
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

  const ringPct = targetSets ? Math.min(100, Math.round((workingCount / targetSets) * 100)) : 0;

  return (
    <section className="card ex-card" aria-label={exercise.name}>
      <button type="button" className="ex-head" aria-expanded={open} onClick={onToggle}>
        <div className="ex-head-main">
          <h3>{exercise.name}</h3>
          <p className="muted">
            {proposalItem
              ? `目標 ${proposalItem.weightKg != null ? `${proposalItem.weightKg}kg × ${proposalItem.pieceCount ?? exercise.defaultPieceCount}個 · ` : ""}${proposalItem.reps}回 × ${proposalItem.sets}セット`
              : exercise.primaryMuscle}
          </p>
        </div>
        {targetSets ? (
          <div
            className={`progress-ring${done ? " progress-done" : ""}`}
            style={{ "--p": `${ringPct}%` } as CSSProperties}
            aria-label={`${workingCount} / ${targetSets} セット完了`}
          >
            <span>{done ? <Icon name="check" size={18} /> : `${workingCount}/${targetSets}`}</span>
          </div>
        ) : (
          <span className="badge">{workingCount}セット</span>
        )}
        <span className={`chev${open ? " chev-open" : ""}`}>
          <Icon name="chevron" size={20} />
        </span>
      </button>

      {open && (
        <div className="ex-body">
          <MotionGuide exercise={exercise} defaultOpen={data.personalSettings.showMotionByDefault ?? false} />
          {previous && (
            <p className="muted">
              前回：{previous.weightKg != null ? `${previous.weightKg}kg × ${previous.pieceCount}個 · ` : ""}
              {previous.reps}回
            </p>
          )}

          {setsHere.length > 0 && (
            <ul className="set-list" aria-label="記録したセット">
              {setsHere.map((s, i) => (
                <li key={s.id} className={`set-row${editingId === s.id ? " set-row-editing" : ""}`}>
                  <span className="set-num">{i + 1}</span>
                  <span className="set-text" data-testid="set-text">
                    {s.weightKg != null ? `${s.weightKg}kg × ${s.pieceCount}個 · ` : ""}
                    {s.reps}回 <small>{formatSideLabel(s.side) !== "-" ? formatSideLabel(s.side) : ""}</small>
                    {s.isWarmup && <span className="badge"> 準備</span>}
                    {s.pain && <span className="badge badge-danger"> 痛み</span>}
                  </span>
                  <button type="button" className="icon-btn" aria-label={`セット${i + 1}を編集`} onClick={() => startEdit(s)}>
                    <Icon name="edit" size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    aria-label={`セット${i + 1}を削除`}
                    onClick={() => {
                      deleteSetRecord(s.id);
                      if (editingId === s.id) setEditingId(null);
                      onSetDeleted(s.id);
                    }}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {isDumbbell && (
            <div className="field" role="group" aria-label="重量">
              <span className="field-label">重量（ダンベル1個あたり）</span>
              <WeightStepPicker steps={steps} valueKg={form.weightKg} onChange={(weightKg) => patch({ weightKg })} />
            </div>
          )}

          {isDumbbell && !exercise.unilateral && (
            <div className="field">
              <span className="field-label">使用個数</span>
              <Segmented
                label="使用個数"
                value={form.pieceCount}
                onChange={(pieceCount) => patch({ pieceCount, side: pieceCount === 2 ? "both" : "na" })}
                options={[
                  { value: 2, label: "2個（左右それぞれ）" },
                  { value: 1, label: "1個（両手で持つ）" },
                ]}
              />
            </div>
          )}

          {exercise.unilateral && (
            <div className="field">
              <span className="field-label">左右</span>
              <Segmented
                label="左右"
                value={form.side}
                onChange={(side) => patch({ side })}
                options={[
                  { value: "left", label: "左" },
                  { value: "right", label: "右" },
                ]}
              />
            </div>
          )}

          <div className="field" role="group" aria-label="回数">
            <span className="field-label">{exercise.id === "plank" ? "秒数" : "回数"}</span>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label="回数を1減らす"
                disabled={form.reps <= 1}
                onClick={() => patch({ reps: Math.max(1, form.reps - 1) })}
              >
                <Icon name="minus" />
              </button>
              <div className="stepper-value">
                <input
                  className="stepper-input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  aria-label="回数"
                  value={form.reps}
                  onChange={(e) => patch({ reps: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
                />
              </div>
              <button type="button" className="stepper-btn" aria-label="回数を1増やす" onClick={() => patch({ reps: form.reps + 1 })}>
                <Icon name="plus" />
              </button>
            </div>
          </div>

          <div className="field">
            <span className="field-label">余力（あと何回できそうだった？）</span>
            <Segmented
              label="余力"
              size="sm"
              value={form.effort}
              onChange={(effort) => patch({ effort })}
              options={(["0", "1", "2", "3+", "unknown"] as Effort[]).map((v) => ({
                value: v,
                label: v === "unknown" ? "不明" : formatEffortLabel(v).replace("あと", ""),
              }))}
            />
          </div>

          <div className="chips">
            <Toggle label="痛みがある" tone="danger" pressed={form.pain} onChange={(pain) => patch({ pain })} />
            <Toggle label="準備セット" pressed={form.isWarmup} onChange={(isWarmup) => patch({ isWarmup })} />
          </div>

          <div className="card-actions">
            <button type="button" className="btn btn-lg" onClick={confirm}>
              <Icon name="check" size={20} />
              {editingId ? "この内容に更新" : `セット${setsHere.length + 1}を完了`}
            </button>
            {editingId && (
              <button type="button" className="btn btn-secondary btn-lg" style={{ flex: "0 0 auto" }} onClick={() => setEditingId(null)}>
                やめる
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function Workout({ onEnd, onGoToday }: { onEnd: () => void; onGoToday: () => void }) {
  const { data, updateSession, updateSetRecord, startSession } = useAppData();
  const session = useMemo(() => data.sessions.find((s) => s.status === "active" || s.status === "paused"), [data.sessions]);
  const now = useNowTick(1000);
  const goal = data.personalSettings.goalPrimary ?? "health";

  const proposal = useMemo(
    () => (session?.proposalId ? data.proposals.find((p) => p.id === session.proposalId) : undefined),
    [data.proposals, session]
  );
  const [added, setAdded] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; undoId?: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const exerciseIds = useMemo(() => {
    const fromProposal = proposal?.items.map((i) => i.exerciseId) ?? [];
    const fromSets = session
      ? data.setRecords.filter((s) => s.sessionId === session.id && !s.deletedAt).map((s) => s.exerciseId)
      : [];
    return [...new Set([...fromProposal, ...fromSets, ...added])];
  }, [proposal, session, data.setRecords, added]);

  const workingCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (!session) return m;
    for (const s of data.setRecords) {
      if (s.sessionId === session.id && !s.deletedAt && !s.isWarmup) m.set(s.exerciseId, (m.get(s.exerciseId) ?? 0) + 1);
    }
    return m;
  }, [data.setRecords, session]);

  const isIncomplete = (id: string) => {
    const target = proposal?.items.find((i) => i.exerciseId === id)?.sets;
    return target == null || (workingCounts.get(id) ?? 0) < target;
  };
  const effectiveOpenId = openId === undefined ? (exerciseIds.find(isIncomplete) ?? null) : openId;

  const addable = useMemo(() => {
    const sets = groupSetsByExercise(data.setRecords);
    return evaluateAvailability(data.exercises, data.equipment, [], sets).filter((a) => !exerciseIds.includes(a.exercise.id));
  }, [data.exercises, data.equipment, data.setRecords, exerciseIds]);

  if (!session) {
    return (
      <div className="screen">
        <Card>
          <EmptyState
            title="運動中のセッションはありません"
            body="今日の候補から始めるか、種目を自分で選んで記録を始められます。"
            action={
              <div className="card-actions card-actions-col">
                <button type="button" className="btn" onClick={onGoToday}>
                  今日の候補を作る
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    startSession({
                      id: newId(),
                      startedAt: new Date().toISOString(),
                      pausedIntervals: [],
                      status: "active",
                    });
                    setAddOpen(true);
                  }}
                >
                  種目を選んで始める
                </button>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  const elapsedMs = activeIntervalsOfSession(session, now).reduce((sum, [a, b]) => sum + (b - a), 0);
  const totalSets = [...workingCounts.values()].reduce((a, b) => a + b, 0);
  const paused = session.status === "paused";
  const restRemaining = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0;

  function togglePause() {
    if (!session) return;
    const t = new Date().toISOString();
    if (session.status === "active") {
      updateSession(session.id, { status: "paused", pausedIntervals: [...session.pausedIntervals, { start: t }] });
    } else {
      const intervals = session.pausedIntervals.map((p, i, arr) => (i === arr.length - 1 && !p.end ? { ...p, end: t } : p));
      updateSession(session.id, { status: "active", pausedIntervals: intervals });
    }
  }

  function endSession() {
    if (!session) return;
    const t = new Date().toISOString();
    const intervals = session.pausedIntervals.map((p) => (p.end ? p : { ...p, end: t }));
    updateSession(session.id, { status: "completed", endedAt: t, pausedIntervals: intervals });
    setEndOpen(false);
    onEnd();
  }

  return (
    <div className="screen">
      <div className="session-bar">
        <div>
          <div className="session-time" aria-label="経過時間" data-testid="elapsed">
            {formatClock(elapsedMs)}
          </div>
        </div>
        <div className="session-meta">
          {paused ? "一時停止中" : "実施中"}
          <br />
          {totalSets}セット完了
        </div>
        <button type="button" className="icon-btn" aria-label={paused ? "再開" : "一時停止"} onClick={togglePause}>
          <Icon name={paused ? "play" : "pause"} size={20} />
        </button>
        <button type="button" className="btn btn-sm" style={{ background: "var(--bg)", color: "var(--text)" }} onClick={() => setEndOpen(true)}>
          終了
        </button>
      </div>

      {exerciseIds.length === 0 && (
        <Card>
          <EmptyState title="種目を選んでください" body="下の「種目を追加」から、今日やる種目を選べます。" />
        </Card>
      )}

      {exerciseIds.map((id) => {
        const exercise = data.exercises.find((e) => e.id === id);
        if (!exercise) return null;
        return (
          <ExercisePanel
            key={id}
            exercise={exercise}
            session={session}
            goal={goal}
            proposalItem={proposal?.items.find((i) => i.exerciseId === id)}
            open={effectiveOpenId === id}
            onToggle={() => setOpenId(effectiveOpenId === id ? null : id)}
            onSetAdded={(restSec, finished) => {
              if (restSec) setRest({ until: Date.now() + restSec * 1000, total: restSec });
              if (finished) {
                const next = exerciseIds.find((x) => x !== id && isIncomplete(x));
                setOpenId(next ?? null);
              }
            }}
            onSetDeleted={(recordId) => setToast({ message: "セットを削除しました", undoId: recordId })}
          />
        );
      })}

      <button type="button" className="btn btn-secondary btn-block" onClick={() => setAddOpen(true)}>
        <Icon name="plus" size={18} /> 種目を追加
      </button>

      {rest && restRemaining > 0 && (
        <div className="rest-bar" role="timer" aria-label="休憩タイマー">
          <div>
            <div className="rest-label">休憩中</div>
            <div className="rest-count" data-testid="rest-remaining">
              {formatClock(restRemaining * 1000)}
            </div>
          </div>
          <button type="button" className="btn" onClick={() => setRest({ until: rest.until + 15000, total: rest.total + 15 })}>
            +15秒
          </button>
          <button type="button" className="btn" onClick={() => setRest(null)}>
            スキップ
          </button>
          <div className="rest-track" aria-hidden="true">
            <div className="rest-fill" style={{ width: `${Math.min(100, (restRemaining / rest.total) * 100)}%` }} />
          </div>
        </div>
      )}

      {rest && restRemaining > 0 && <div style={{ height: 84 }} aria-hidden="true" />}

      <Sheet title="種目を追加" open={addOpen} onClose={() => setAddOpen(false)}>
        {addable.length === 0 && <p className="muted">追加できる種目がありません。</p>}
        {addable.map((a) => {
          const blocked = !a.available && !a.excludedByPain;
          return (
            <button
              key={a.exercise.id}
              type="button"
              className="pick-row"
              disabled={blocked}
              style={blocked ? { opacity: 0.5 } : undefined}
              onClick={() => {
                setAdded((prev) => [...prev, a.exercise.id]);
                setOpenId(a.exercise.id);
                setAddOpen(false);
              }}
            >
              <div>
                <strong>{a.exercise.name}</strong>
                <span>
                  {a.exercise.primaryMuscle}
                  {a.excludedByPain ? " ・前回痛みの申告あり" : ""}
                  {blocked ? ` ・${a.unavailableReason}` : ""}
                </span>
              </div>
              <Icon name="chevron" size={18} />
            </button>
          );
        })}
      </Sheet>

      <Sheet title="セッションを終了" open={endOpen} onClose={() => setEndOpen(false)}>
        <p className="lead">
          {totalSets}セット・{formatClock(elapsedMs)}の記録を保存して終了します。
        </p>
        <button type="button" className="btn btn-block btn-lg" onClick={endSession}>
          終了して振り返る
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => setEndOpen(false)}>
          続ける
        </button>
      </Sheet>

      {toast && (
        <Toast
          message={toast.message}
          actionLabel={toast.undoId ? "元に戻す" : undefined}
          onAction={() => toast.undoId && updateSetRecord(toast.undoId, { deletedAt: undefined })}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
