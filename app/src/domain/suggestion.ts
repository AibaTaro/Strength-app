import type { Exercise, Goal, SetRecord, RepRangeSetting } from "./types";
import { stepWeight, maxWeight, minWeight } from "./equipment";

export const RULES_VERSION = "v1-2026-09-14";

export interface WeightSuggestion {
  weightKg?: number;
  pieceCount?: 1 | 2;
  reps: number;
  sets: number;
  reason: string;
  isInitialAdjustment: boolean;
  suggestAlternativeExerciseIds?: string[];
  painWarning?: boolean;
}

function groupBySessionDesc(historyDesc: SetRecord[]): SetRecord[][] {
  const bySession = new Map<string, SetRecord[]>();
  const order: string[] = [];
  for (const s of historyDesc) {
    if (!bySession.has(s.sessionId)) {
      bySession.set(s.sessionId, []);
      order.push(s.sessionId);
    }
    bySession.get(s.sessionId)!.push(s);
  }
  return order.map((id) => bySession.get(id)!);
}

function allSetsMaxedWithGoodEffort(sets: SetRecord[], repRange: RepRangeSetting): boolean {
  if (sets.length === 0) return false;
  return sets.every(
    (s) => s.reps >= repRange.maxReps && (s.effort === "2" || s.effort === "3+") && !s.pain
  );
}

/**
 * 自重種目(bodyweight)の提案。重量は扱わない。
 */
export function suggestBodyweight(exercise: Exercise, goal: Goal, historyDesc: SetRecord[]): WeightSuggestion {
  const range = exercise.repRangeByGoal[goal];
  const isInitial = historyDesc.length === 0;
  const latestPain = historyDesc[0]?.pain ?? false;
  if (latestPain) {
    return {
      pieceCount: 1,
      reps: historyDesc[0].reps,
      sets: range.sets,
      reason: "前回痛みの申告があったため回数を増やさず据え置きます。無理な場合は中止してください。",
      isInitialAdjustment: false,
      painWarning: true,
    };
  }
  if (isInitial) {
    return {
      pieceCount: 1,
      reps: range.minReps,
      sets: range.sets,
      reason: "初回調整が必要です。無理のない回数から始め、実施結果から基準を作ります。",
      isInitialAdjustment: true,
    };
  }
  const last = historyDesc[0];
  const nextReps = Math.min(last.reps + 1, range.maxReps);
  return {
    pieceCount: 1,
    reps: nextReps,
    sets: range.sets,
    reason:
      last.reps >= range.maxReps
        ? "設定した回数範囲の上限に到達しています。セット数はそのまま維持します。"
        : "前回の回数をもとに、範囲内で少しずつ回数を増やします。",
    isInitialAdjustment: false,
  };
}

/**
 * ダンベル種目の重量・回数提案。16段階の登録重量のみを使い、範囲外の重量を作らない。
 */
export function suggestDumbbellProgression(
  exercise: Exercise,
  goal: Goal,
  steps: readonly number[],
  historyDesc: SetRecord[]
): WeightSuggestion {
  const range = exercise.repRangeByGoal[goal];
  const pieceCount = exercise.defaultPieceCount;

  if (historyDesc.length === 0) {
    return {
      weightKg: minWeight(steps),
      pieceCount,
      reps: range.minReps,
      sets: range.sets,
      reason: "初回調整が必要です。実績がないため最小重量から始め、実施結果から基準を作ります。",
      isInitialAdjustment: true,
    };
  }

  const last = historyDesc[0];
  const lastWeight = last.weightKg ?? minWeight(steps);

  if (last.pain) {
    return {
      weightKg: lastWeight,
      pieceCount: last.pieceCount,
      reps: last.reps,
      sets: range.sets,
      reason: "前回痛みの申告があったため増量せず据え置きます。中止や代替種目への変更も検討してください。",
      isInitialAdjustment: false,
      painWarning: true,
      suggestAlternativeExerciseIds: exercise.alternativeExerciseIds,
    };
  }

  const sessions = groupBySessionDesc(historyDesc);
  const recentTwoSessions = sessions.slice(0, 2);
  const readyForIncrease =
    recentTwoSessions.length === 2 &&
    recentTwoSessions.every((sets) => allSetsMaxedWithGoodEffort(sets, range));

  if (lastWeight >= maxWeight(steps)) {
    return {
      weightKg: lastWeight,
      pieceCount: last.pieceCount,
      reps: Math.min(last.reps, range.maxReps),
      sets: range.sets,
      reason: "登録されている最大重量に到達済みです。これ以上の増量や回数の際限のない上乗せは行いません。",
      isInitialAdjustment: false,
    };
  }

  if (readyForIncrease) {
    const nextWeight = stepWeight(steps, lastWeight, 1);
    const increment = nextWeight - lastWeight;
    if (increment <= range.maxIncrementKg) {
      return {
        weightKg: nextWeight,
        pieceCount,
        reps: range.minReps,
        sets: range.sets,
        reason: `直近2回で上限回数(${range.maxReps}回)に到達し余力も十分なため、次の登録重量(${nextWeight}kg)に増量します。`,
        isInitialAdjustment: false,
      };
    }
    // 刻みが種目別の増加上限を超えるため自動増量しない。回数範囲内で調整する。
    const nextReps = Math.min(last.reps + 1, range.maxReps);
    return {
      weightKg: lastWeight,
      pieceCount: last.pieceCount,
      reps: nextReps,
      sets: range.sets,
      reason: `次の登録重量までの刻み(${increment}kg)がこの種目の増量上限(${range.maxIncrementKg}kg)を超えるため重量は据え置き、回数範囲内で調整します。`,
      isInitialAdjustment: false,
    };
  }

  if (last.reps < range.minReps || last.effort === "0" || last.effort === "1") {
    if (lastWeight <= minWeight(steps)) {
      return {
        weightKg: lastWeight,
        pieceCount: last.pieceCount,
        reps: last.reps,
        sets: range.sets,
        reason: "最小重量でも実施が難しいため、代替種目を検討してください。",
        isInitialAdjustment: false,
        suggestAlternativeExerciseIds: exercise.alternativeExerciseIds,
      };
    }
    const nextWeight = stepWeight(steps, lastWeight, -1);
    return {
      weightKg: nextWeight,
      pieceCount: last.pieceCount,
      reps: range.minReps,
      sets: range.sets,
      reason: "前回、設定した回数範囲の下限に届かなかったため、1段階軽い登録重量に調整します。",
      isInitialAdjustment: false,
    };
  }

  return {
    weightKg: lastWeight,
    pieceCount: last.pieceCount,
    reps: last.reps,
    sets: range.sets,
    reason: "増量条件(直近2回とも上限回数・余力十分)を満たしていないため、今回は据え置きます。",
    isInitialAdjustment: false,
  };
}
