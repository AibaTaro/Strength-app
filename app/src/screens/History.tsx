import { useMemo, useState } from "react";
import { useAppData } from "../state/AppContext";
import { aggregateSets, calcSetLoadKg, type PeriodAggregation } from "../domain/aggregation";
import {
  getJstYmd,
  last7DaysPeriod,
  lastMonthPeriod,
  previousComparablePeriod,
  yesterdayPeriod,
  ymdToKey,
} from "../domain/date";
import { formatDurationMs, formatSideLabel } from "../domain/format";
import { Card, EmptyState, Icon, Segmented, SectionTitle, Toast } from "../components/ui";

type PeriodKey = "yesterday" | "week" | "month";
const PERIODS = { yesterday: yesterdayPeriod, week: last7DaysPeriod, month: lastMonthPeriod };

function Delta({ current, previous, unit }: { current: number; previous: number; unit: string }) {
  if (previous === 0) return <div className="stat-delta">比較元なし</div>;
  const diff = current - previous;
  if (diff === 0) return <div className="stat-delta">前期間と同じ</div>;
  return (
    <div className={`stat-delta ${diff > 0 ? "up" : "down"}`}>
      前期間比 {diff > 0 ? "+" : ""}
      {diff}
      {unit}
    </div>
  );
}

function fmtYmd(p: { y: number; m: number; d: number }) {
  return `${p.m}/${p.d}`;
}

const dayFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" });
const timeFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });

export function History() {
  const { data, deleteSetRecord, updateSetRecord } = useAppData();
  const [periodKey, setPeriodKey] = useState<PeriodKey>("week");
  const [toast, setToast] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const { agg, prev } = useMemo(() => {
    const period = PERIODS[periodKey](now);
    return {
      agg: aggregateSets(data.setRecords, data.sessions, data.exercises, period),
      prev: aggregateSets(data.setRecords, data.sessions, data.exercises, previousComparablePeriod(period)),
    };
  }, [periodKey, now, data.setRecords, data.sessions, data.exercises]);

  const exerciseName = (id: string) => data.exercises.find((e) => e.id === id)?.name ?? id;
  const maxSets = Math.max(1, ...agg.exerciseVolumes.map((v) => v.setCount));

  const grouped = useMemo(() => {
    const sets = data.setRecords
      .filter((s) => !s.deletedAt)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, 60);
    const map = new Map<string, typeof sets>();
    for (const s of sets) {
      const key = ymdToKey(getJstYmd(new Date(s.completedAt)));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [data.setRecords]);

  const weights = useMemo(() => [...data.weightHistory].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5), [data.weightHistory]);
  const empty = data.setRecords.filter((s) => !s.deletedAt).length === 0;

  return (
    <div className="screen">
      <Segmented
        label="集計期間"
        value={periodKey}
        onChange={setPeriodKey}
        options={[
          { value: "yesterday", label: "前日" },
          { value: "week", label: "直近7日" },
          { value: "month", label: "直近1か月" },
        ]}
      />
      <p className="muted" data-testid="period-range">
        {fmtYmd(agg.period.startYmd)}
        {agg.period.startYmd.y !== agg.period.endYmdInclusive.y ? `（${agg.period.startYmd.y}）` : ""} 〜 {fmtYmd(agg.period.endYmdInclusive)}（日本時間）
      </p>

      {empty ? (
        <Card>
          <EmptyState title="まだ記録がありません" body="運動を記録すると、ここに実施日数・セット数・運動時間が集計されます。" />
        </Card>
      ) : (
        <>
          <Card>
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-value" data-testid="stat-days">
                  {agg.activeDayCount}
                  <small>日</small>
                </div>
                <div className="stat-label">実施日数</div>
                <Delta current={agg.activeDayCount} previous={prev.activeDayCount} unit="日" />
              </div>
              <div className="stat">
                <div className="stat-value" data-testid="stat-sets">
                  {agg.totalSetCount}
                  <small>セット</small>
                </div>
                <div className="stat-label">セット数</div>
                <Delta current={agg.totalSetCount} previous={prev.totalSetCount} unit="セット" />
              </div>
              <div className="stat">
                <div className="stat-value" style={{ fontSize: 20 }} data-testid="stat-time">
                  {agg.totalDurationMs > 0 ? formatDurationMs(agg.totalDurationMs) : "0分"}
                </div>
                <div className="stat-label">運動時間</div>
                <Delta
                  current={Math.round(agg.totalDurationMs / 60000)}
                  previous={Math.round(prev.totalDurationMs / 60000)}
                  unit="分"
                />
              </div>
            </div>
          </Card>

          <ExerciseBreakdown agg={agg} maxSets={maxSets} nameOf={exerciseName} />
        </>
      )}

      <SectionTitle>体重の推移</SectionTitle>
      <Card>
        {weights.length === 0 ? (
          <p className="muted">記録なし（設定タブで体重を記録できます）</p>
        ) : (
          <ul className="list">
            {weights.map((w, i) => {
              const older = weights[i + 1];
              const diff = older ? Math.round((w.weightKg - older.weightKg) * 10) / 10 : null;
              return (
                <li key={w.id} className="list-row">
                  <div className="list-row-main">
                    <div className="list-row-title">{w.weightKg}kg</div>
                    <div className="muted">{w.date}</div>
                  </div>
                  {diff != null && diff !== 0 && <span className={`badge ${diff < 0 ? "badge-ok" : "badge-warn"}`}>{diff > 0 ? "+" : ""}{diff}kg</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {!empty && (
        <>
          <SectionTitle aside={<span className="muted">最新60件</span>}>記録の一覧</SectionTitle>
          {grouped.map(([key, sets]) => (
            <Card key={key}>
              <div className="day-head">{dayFmt.format(new Date(sets[0].completedAt))}</div>
              <ul className="list">
                {sets.map((s) => {
                  const ex = data.exercises.find((e) => e.id === s.exerciseId);
                  const load = ex ? calcSetLoadKg(s, ex) : null;
                  return (
                    <li key={s.id} className="list-row">
                      <div className="list-row-main">
                        <div className="list-row-title">{exerciseName(s.exerciseId)}</div>
                        <div className="muted">
                          {timeFmt.format(new Date(s.completedAt))} ・{" "}
                          {s.weightKg != null ? `${s.weightKg}kg × ${s.pieceCount}個 ・ ` : "自重 ・ "}
                          {s.reps}回
                          {formatSideLabel(s.side) !== "-" ? ` ・ ${formatSideLabel(s.side)}` : ""}
                          {load != null ? ` ・ 負荷量${load}kg` : ""}
                          {s.isWarmup ? " ・ 準備" : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        aria-label={`${exerciseName(s.exerciseId)}の記録を削除`}
                        onClick={() => {
                          deleteSetRecord(s.id);
                          setUndoId(s.id);
                          setToast("記録を削除しました");
                        }}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </>
      )}

      {toast && (
        <Toast
          message={toast}
          actionLabel="元に戻す"
          onAction={() => undoId && updateSetRecord(undoId, { deletedAt: undefined })}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

function ExerciseBreakdown({
  agg,
  maxSets,
  nameOf,
}: {
  agg: PeriodAggregation;
  maxSets: number;
  nameOf: (id: string) => string;
}) {
  if (agg.exerciseVolumes.length === 0) {
    return (
      <Card>
        <p className="muted">この期間の記録はありません。</p>
      </Card>
    );
  }
  const muscles = Object.entries(agg.setCountByPrimaryMuscle).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <SectionTitle>種目別</SectionTitle>
      <Card>
        {agg.exerciseVolumes.map((v) => (
          <div key={v.exerciseId} className="bar-row">
            <span className="bar-name">{nameOf(v.exerciseId)}</span>
            <span className="bar-val">
              {v.setCount}セット・{v.totalReps}回{v.totalLoadKg > 0 ? `・負荷量${v.totalLoadKg}kg` : ""}
            </span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(v.setCount / maxSets) * 100}%` }} />
            </div>
          </div>
        ))}
        <p className="muted">負荷量＝重量（1個あたり）×使用個数×回数の参考値。自重種目は含みません。</p>
      </Card>
      <SectionTitle>部位別セット数</SectionTitle>
      <Card>
        <div className="chips">
          {muscles.map(([m, n]) => (
            <span key={m} className="badge badge-info">
              {m} {n}セット
            </span>
          ))}
        </div>
      </Card>
    </>
  );
}
