import { useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "../state/AppContext";
import { newId } from "../domain/id";
import {
  buildProposal,
  buildProposalItem,
  estimatedSecondsForExercise,
  evaluateAvailability,
  groupSetsByExercise,
} from "../domain/proposalBuilder";
import { getDumbbell } from "../domain/equipment";
import { formatGoalLabel } from "../domain/format";
import type { Proposal } from "../domain/types";
import { Card, EmptyState, Icon, Segmented, Sheet } from "../components/ui";

interface Props {
  onStartWorkout: () => void;
  onOpenSettings: () => void;
}

export function Today({ onStartWorkout, onOpenSettings }: Props) {
  const { data, addProposal, startSession } = useAppData();
  const muscles = useMemo(() => [...new Set(data.exercises.map((e) => e.primaryMuscle))], [data.exercises]);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(data.personalSettings.sessionMinutes ?? 30);
  const [fatigue, setFatigue] = useState<"low" | "mid" | "high">("low");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [excludedReasons, setExcludedReasons] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const activeSession = data.sessions.find((s) => s.status === "active" || s.status === "paused");
  const goal = data.personalSettings.goalPrimary ?? "health";
  const setsByExercise = useMemo(() => groupSetsByExercise(data.setRecords), [data.setRecords]);
  const exerciseById = useMemo(() => new Map(data.exercises.map((e) => [e.id, e])), [data.exercises]);

  const swapCandidates = useMemo(
    () =>
      evaluateAvailability(
        data.exercises,
        data.equipment,
        data.personalSettings.avoidMovements ?? [],
        setsByExercise
      )
        .filter((a) => a.available)
        .map((a) => a.exercise)
        .filter((e) => !proposal?.items.some((it) => it.exerciseId === e.id)),
    [data.exercises, data.equipment, data.personalSettings.avoidMovements, setsByExercise, proposal]
  );

  useEffect(() => {
    if (proposal) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [proposal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleMuscle(m: string) {
    setSelectedMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function handleBuild() {
    setErrorMessage(null);
    try {
      const { proposal: p, excluded } = buildProposal({
        data,
        selectedMuscles,
        availableMinutes: minutes,
        now: new Date(),
      });
      setProposal(p);
      setExcludedReasons(excluded.map((e) => `${e.exercise.name}：${e.unavailableReason ?? ""}`));
      if (p.items.length === 0) {
        setErrorMessage(
          "条件に合う種目がありません。部位・使える時間・避けたい種目の設定を見直してください。除外した理由は下の一覧で確認できます。"
        );
      }
    } catch (e) {
      setProposal(null);
      setErrorMessage(`候補を作れませんでした：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function swapTo(index: number, exerciseId: string) {
    if (!proposal) return;
    const exercise = exerciseById.get(exerciseId);
    if (!exercise) return;
    const item = buildProposalItem(
      exercise,
      goal,
      getDumbbell(data.equipment)?.weightStepsKg ?? [],
      setsByExercise.get(exerciseId) ?? []
    );
    const items = [...proposal.items];
    items[index] = item;
    setProposal({ ...proposal, items });
    setSwapIndex(null);
  }

  function removeItem(index: number) {
    if (!proposal) return;
    setProposal({ ...proposal, items: proposal.items.filter((_, i) => i !== index) });
  }

  function handleStart() {
    if (!proposal || proposal.items.length === 0) return;
    addProposal(proposal);
    startSession({
      id: newId(),
      startedAt: new Date().toISOString(),
      pausedIntervals: [],
      status: "active",
      fatigue,
      proposalId: proposal.id,
    });
    onStartWorkout();
  }

  const totalMinutes = proposal
    ? Math.round(
        proposal.items.reduce((sum, it) => {
          const ex = exerciseById.get(it.exerciseId);
          return sum + (ex ? estimatedSecondsForExercise(ex, goal) : 0);
        }, 0) / 60
      )
    : 0;

  return (
    <div className="screen">
      {activeSession && (
        <Card tone="accent">
          <p className="lead">
            <strong>運動中のセッションがあります。</strong>続きから記録できます。
          </p>
          <button type="button" className="btn btn-block" onClick={onStartWorkout}>
            <Icon name="play" size={18} /> 運動を再開する
          </button>
        </Card>
      )}

      {!data.personalSettings.goalPrimary && (
        <Card tone="warn">
          <p className="lead">
            <strong>目的が未設定です。</strong>設定すると、回数・セット数が目的に合わせて調整されます(未設定の間は「健康維持」で計算)。
          </p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenSettings}>
            設定を開く
          </button>
        </Card>
      )}

      <Card>
        <div className="field" role="group" aria-label="鍛える部位">
          <span className="field-label">鍛える部位（未選択ならおまかせ）</span>
          <div className="chips">
            {muscles.map((m) => (
              <button
                key={m}
                type="button"
                className="chip"
                aria-pressed={selectedMuscles.includes(m)}
                onClick={() => toggleMuscle(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">使える時間</span>
          <Segmented
            label="使える時間"
            value={minutes}
            onChange={setMinutes}
            options={[15, 30, 45, 60, 90].map((m) => ({ value: m, label: `${m}分` }))}
          />
        </div>
        <div className="field">
          <span className="field-label">今日の疲労</span>
          <Segmented
            label="今日の疲労"
            value={fatigue}
            onChange={setFatigue}
            options={[
              { value: "low", label: "少ない" },
              { value: "mid", label: "普通" },
              { value: "high", label: "強い" },
            ]}
          />
        </div>
        <p className="muted">目的：{formatGoalLabel(data.personalSettings.goalPrimary)}</p>
        <button type="button" className="btn btn-block btn-lg" onClick={handleBuild}>
          <Icon name="today" size={20} /> 今日の候補を作る
        </button>
      </Card>

      <div ref={resultRef} style={{ scrollMarginTop: 90 }} />

      {errorMessage && (
        <Card tone="danger">
          <p role="alert" className="lead">
            {errorMessage}
          </p>
        </Card>
      )}

      {proposal && proposal.items.length > 0 && (
        <>
          <div className="section-title">
            <h2>今日の候補</h2>
            <span className="muted">
              {proposal.items.length}種目・約{totalMinutes}分
            </span>
          </div>
          {proposal.items.map((item, idx) => {
            const ex = exerciseById.get(item.exerciseId);
            if (!ex) return null;
            const pieces = item.pieceCount ?? ex.defaultPieceCount;
            return (
              <section key={item.exerciseId} className="card" aria-label={ex.name}>
                <div className="proposal-head">
                  <span className="proposal-index">{idx + 1}</span>
                  <div className="proposal-title">
                    <h3>{ex.name}</h3>
                    <p className="muted">{ex.primaryMuscle}</p>
                  </div>
                </div>
                <div className="spec">
                  {item.weightKg != null ? (
                    <span className="spec-main">
                      {item.weightKg}
                      <small>kg</small> × {pieces}
                      <small>個</small>
                    </span>
                  ) : (
                    <span className="spec-main">自重</span>
                  )}
                  <span className="spec-sub">
                    {item.reps}
                    <small>回</small> × {item.sets}
                    <small>セット</small>
                  </span>
                </div>
                <div className="badges">
                  {item.isInitialAdjustment && <span className="badge badge-warn">初回調整</span>}
                  {ex.materialStatus === "confirmed" ? (
                    <span className="badge badge-ok">教材 確認済み</span>
                  ) : (
                    <span className="badge">教材 未確認</span>
                  )}
                </div>
                <p className="reason">{item.reason}</p>
                <div className="card-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSwapIndex(idx)}>
                    <Icon name="swap" size={16} /> 種目を変える
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem(idx)}>
                    外す
                  </button>
                </div>
              </section>
            );
          })}

          <div className="cta-bar">
            <button type="button" className="btn btn-block btn-lg" onClick={handleStart}>
              この内容で開始（{proposal.items.length}種目）
            </button>
          </div>
        </>
      )}

      {proposal && proposal.items.length === 0 && !errorMessage && (
        <EmptyState title="候補がありません" body="条件を変えてもう一度お試しください。" />
      )}

      {excludedReasons.length > 0 && (
        <details className="card details">
          <summary>候補から除外した種目（{excludedReasons.length}）</summary>
          <ul>
            {excludedReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}

      <Sheet title="種目を変える" open={swapIndex !== null} onClose={() => setSwapIndex(null)}>
        {swapCandidates.length === 0 && <p className="muted">交換できる種目がありません。</p>}
        {swapCandidates.map((e) => (
          <button
            key={e.id}
            type="button"
            className="pick-row"
            onClick={() => swapIndex !== null && swapTo(swapIndex, e.id)}
          >
            <div>
              <strong>{e.name}</strong>
              <span>{e.primaryMuscle}</span>
            </div>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </Sheet>
    </div>
  );
}
