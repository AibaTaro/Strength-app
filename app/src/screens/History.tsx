import { useMemo, useState } from "react";
import { useAppData } from "../state/AppContext";
import { aggregateSets, calcSetLoadKg } from "../domain/aggregation";
import { last7DaysPeriod, lastMonthPeriod, previousComparablePeriod, yesterdayPeriod } from "../domain/date";
import { formatDurationMs, formatSideLabel, formatWeightLabel } from "../domain/format";

function useAggregationBlock(
  label: string,
  periodFn: (now: Date) => ReturnType<typeof yesterdayPeriod>,
  data: ReturnType<typeof useAppData>["data"],
  now: Date
) {
  const period = periodFn(now);
  const agg = aggregateSets(data.setRecords, data.sessions, data.exercises, period);
  const prevPeriod = previousComparablePeriod(period);
  const prevAgg = aggregateSets(data.setRecords, data.sessions, data.exercises, prevPeriod);
  return { label, agg, prevAgg };
}

function DiffLine({ current, previous, unit }: { current: number; previous: number; unit: string }) {
  if (previous === 0) {
    return (
      <span>
        {current}
        {unit}(記録なし比較のため実数のみ)
      </span>
    );
  }
  const diff = current - previous;
  const sign = diff >= 0 ? "+" : "";
  return (
    <span>
      {current}
      {unit}({sign}
      {diff}
      {unit})
    </span>
  );
}

export function History() {
  const appData = useAppData();
  const { data, deleteSetRecord } = appData;
  const now = new Date();

  const yesterday = useAggregationBlock("前日", yesterdayPeriod, data, now);
  const week = useAggregationBlock("直近7日", last7DaysPeriod, data, now);
  const month = useAggregationBlock("直近1か月", lastMonthPeriod, data, now);

  const [expandedExerciseHistory, setExpandedExerciseHistory] = useState(false);

  const recentSets = useMemo(
    () =>
      [...data.setRecords]
        .filter((s) => !s.deletedAt)
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
        .slice(0, expandedExerciseHistory ? 200 : 20),
    [data.setRecords, expandedExerciseHistory]
  );

  const weightHistorySorted = useMemo(
    () => [...data.weightHistory].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.weightHistory]
  );

  function exerciseName(id: string) {
    return data.exercises.find((e) => e.id === id)?.name ?? id;
  }

  return (
    <div className="screen">
      <h2>振り返り</h2>

      {[yesterday, week, month].map(({ label, agg, prevAgg }) => (
        <section key={label} className="aggregation-block">
          <h3>
            {label}({agg.period.startYmd.y}/{agg.period.startYmd.m}/{agg.period.startYmd.d} 〜{" "}
            {agg.period.endYmdInclusive.y}/{agg.period.endYmdInclusive.m}/{agg.period.endYmdInclusive.d})
          </h3>
          <p>
            実施日数: <DiffLine current={agg.activeDayCount} previous={prevAgg.activeDayCount} unit="日" />
          </p>
          <p>
            セット数: <DiffLine current={agg.totalSetCount} previous={prevAgg.totalSetCount} unit="セット" />
          </p>
          <p>運動時間: {formatDurationMs(agg.totalDurationMs)}</p>
          {agg.exerciseVolumes.length > 0 && (
            <ul>
              {agg.exerciseVolumes.map((v) => (
                <li key={v.exerciseId}>
                  {exerciseName(v.exerciseId)}: {v.setCount}セット / {v.totalReps}回
                  {v.totalLoadKg > 0 && ` / 参考負荷量 ${v.totalLoadKg}kg`}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section>
        <h3>体重推移</h3>
        {weightHistorySorted.length === 0 ? (
          <p>記録なし</p>
        ) : (
          <ul>
            {weightHistorySorted.slice(0, 10).map((w) => (
              <li key={w.id}>
                {w.date}: {w.weightKg}kg{w.bodyFatPct != null && ` (体脂肪率${w.bodyFatPct}%)`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>実績一覧・修正</h3>
        <ul className="record-list">
          {recentSets.map((s) => {
            const ex = data.exercises.find((e) => e.id === s.exerciseId);
            const load = ex ? calcSetLoadKg(s, ex) : null;
            return (
              <li key={s.id}>
                {new Date(s.completedAt).toLocaleString("ja-JP")} {exerciseName(s.exerciseId)} —{" "}
                {formatWeightLabel(s.weightKg, s.pieceCount)} × {s.reps}回 [{formatSideLabel(s.side)}]
                {load != null && ` (参考負荷量${load}kg)`}
                {s.isWarmup && <span className="badge">準備</span>}
                <button type="button" onClick={() => deleteSetRecord(s.id)}>
                  削除
                </button>
              </li>
            );
          })}
        </ul>
        {!expandedExerciseHistory && data.setRecords.length > 20 && (
          <button type="button" onClick={() => setExpandedExerciseHistory(true)}>
            もっと見る
          </button>
        )}
      </section>
    </div>
  );
}
