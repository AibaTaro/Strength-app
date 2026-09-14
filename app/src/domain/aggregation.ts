import type { Exercise, SetRecord, WorkoutSession } from "./types";
import { addDays, getJstYmd, jstMidnightUtcMs, ymdToKey, type Period } from "./date";

/**
 * セット1件の外部負荷量(参考値、kg)。自重種目はnull(体重をそのまま重量とみなさない)。
 * 使用個数・左右は二重計上しない: weightKg(1個あたり) × pieceCount × reps のみ。
 * 左右別のセットはそれぞれ別のSetRecordとして渡し、呼び出し側で合算する。
 */
export function calcSetLoadKg(set: SetRecord, exercise: Exercise): number | null {
  if (exercise.loadType === "bodyweight") return null;
  if (set.weightKg == null) return null;
  return set.weightKg * set.pieceCount * set.reps;
}

export function isCompletedSet(set: SetRecord): boolean {
  return !set.deletedAt;
}

function inPeriod(iso: string, p: Period): boolean {
  const ms = new Date(iso).getTime();
  return ms >= p.startMs && ms < p.endMs;
}

export interface ExerciseVolume {
  exerciseId: string;
  totalLoadKg: number;
  totalReps: number;
  setCount: number;
}

export interface PeriodAggregation {
  period: Period;
  activeDayCount: number;
  totalSetCount: number;
  totalDurationMs: number;
  exerciseVolumes: ExerciseVolume[];
  /** 主対象部位別セット数(補助部位は二重計上しない) */
  setCountByPrimaryMuscle: Record<string, number>;
}

export function aggregateSets(
  allSets: SetRecord[],
  sessions: WorkoutSession[],
  exercises: Exercise[],
  p: Period
): PeriodAggregation {
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const relevant = allSets.filter(
    (s) => isCompletedSet(s) && !s.isWarmup && inPeriod(s.completedAt, p)
  );

  const activeDays = new Set<string>();
  const volumeByExercise = new Map<string, ExerciseVolume>();
  const setCountByPrimaryMuscle: Record<string, number> = {};

  for (const s of relevant) {
    const ex = exerciseById.get(s.exerciseId);
    if (!ex) continue;
    const dayKey = ymdToKey(getJstYmd(new Date(s.completedAt)));
    activeDays.add(dayKey);

    const load = calcSetLoadKg(s, ex);
    const entry = volumeByExercise.get(s.exerciseId) ?? {
      exerciseId: s.exerciseId,
      totalLoadKg: 0,
      totalReps: 0,
      setCount: 0,
    };
    entry.totalLoadKg += load ?? 0;
    entry.totalReps += s.reps;
    entry.setCount += 1;
    volumeByExercise.set(s.exerciseId, entry);

    setCountByPrimaryMuscle[ex.primaryMuscle] = (setCountByPrimaryMuscle[ex.primaryMuscle] ?? 0) + 1;
  }

  const relevantSessionIds = new Set(relevant.map((s) => s.sessionId));
  const totalDurationMs = sessions
    .filter((sess) => relevantSessionIds.has(sess.id))
    .reduce((sum, sess) => sum + sessionDurationInPeriodMs(sess, p), 0);

  return {
    period: p,
    activeDayCount: activeDays.size,
    totalSetCount: relevant.length,
    totalDurationMs,
    exerciseVolumes: [...volumeByExercise.values()],
    setCountByPrimaryMuscle,
  };
}

/**
 * セッションの経過時間(休憩含む・一時停止を除く)を、期間との重なり分だけミリ秒で返す。
 * 日跨ぎのセッションは呼び出し側で日ごとに配賦したい場合、allocateSessionByDayを使う。
 */
export function sessionDurationInPeriodMs(session: WorkoutSession, p: Period): number {
  const activeIntervals = activeIntervalsOfSession(session);
  let total = 0;
  for (const [start, end] of activeIntervals) {
    const clampedStart = Math.max(start, p.startMs);
    const clampedEnd = Math.min(end, p.endMs);
    if (clampedEnd > clampedStart) total += clampedEnd - clampedStart;
  }
  return total;
}

/** 一時停止区間を除いた、セッションの稼働区間([開始,終了]のUTCミリ秒)一覧 */
export function activeIntervalsOfSession(session: WorkoutSession, nowMs = Date.now()): [number, number][] {
  const sessionStart = new Date(session.startedAt).getTime();
  const sessionEnd = session.endedAt ? new Date(session.endedAt).getTime() : nowMs;
  const pauses = session.pausedIntervals
    .map((pi) => ({
      start: new Date(pi.start).getTime(),
      end: pi.end ? new Date(pi.end).getTime() : nowMs,
    }))
    .sort((a, b) => a.start - b.start);

  const intervals: [number, number][] = [];
  let cursor = sessionStart;
  for (const pause of pauses) {
    const pauseStart = Math.max(pause.start, sessionStart);
    const pauseEnd = Math.min(pause.end, sessionEnd);
    if (pauseStart > cursor) intervals.push([cursor, pauseStart]);
    cursor = Math.max(cursor, pauseEnd);
  }
  if (cursor < sessionEnd) intervals.push([cursor, sessionEnd]);
  return intervals;
}

/** セッションの稼働時間を、日跨ぎの場合は日ごとに配賦してミリ秒を返す */
export function allocateSessionByDay(session: WorkoutSession, nowMs = Date.now()): Map<string, number> {
  const result = new Map<string, number>();
  for (const [start, end] of activeIntervalsOfSession(session, nowMs)) {
    let cursor = start;
    while (cursor < end) {
      const ymd = getJstYmd(new Date(cursor));
      const nextMidnight = jstMidnightUtcMs(addDays(ymd, 1));
      const chunkEnd = Math.min(end, nextMidnight);
      const key = ymdToKey(ymd);
      result.set(key, (result.get(key) ?? 0) + (chunkEnd - cursor));
      cursor = chunkEnd;
    }
  }
  return result;
}
