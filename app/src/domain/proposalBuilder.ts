import type {
  AppData,
  Equipment,
  Exercise,
  Goal,
  PersonalSettings,
  Proposal,
  ProposalItem,
  SetRecord,
} from "./types";
import { getBench, getDumbbell } from "./equipment";
import { RULES_VERSION, suggestBodyweight, suggestDumbbellProgression } from "./suggestion";

/** 種目1セットあたりの概算所要時間(秒)。実施+準備。休憩は目的別に別途加算する。 */
const EXEC_SECONDS_PER_SET = 40;
export const REST_SECONDS_BY_GOAL: Record<Goal, number> = {
  strength: 150,
  hypertrophy: 90,
  fatloss: 60,
  health: 90,
};
const PREP_SECONDS_PER_EXERCISE = 90;
const MAX_EXERCISES_IN_PROPOSAL = 6;

export interface AvailabilityResult {
  exercise: Exercise;
  available: boolean;
  unavailableReason?: string;
  excludedByPain?: boolean;
  excludedByAvoid?: boolean;
}

/** 器具・避けたい種目・直近の痛みで候補を絞り込む(処理順序 1〜2) */
export function evaluateAvailability(
  exercises: Exercise[],
  equipment: Equipment[],
  avoidExerciseIds: string[],
  allSetsDescByExercise: Map<string, SetRecord[]>
): AvailabilityResult[] {
  const dumbbell = getDumbbell(equipment);
  const bench = getBench(equipment);
  const hasPushUpBar = equipment.some((e) => e.type === "pushUpBar");

  return exercises.map((exercise) => {
    for (const req of exercise.requiredEquipment) {
      if (req === "dumbbell" && !dumbbell) {
        return { exercise, available: false, unavailableReason: "ダンベルが登録されていません。" };
      }
      if (req === "bench" && !bench) {
        return { exercise, available: false, unavailableReason: "ベンチが登録されていません。" };
      }
      if (req === "pushUpBar" && !hasPushUpBar) {
        return { exercise, available: false, unavailableReason: "プッシュバーが登録されていません。" };
      }
    }
    if (exercise.requiresBenchAngle && (!bench || !bench.angleConfirmed)) {
      return {
        exercise,
        available: false,
        unavailableReason: "ベンチの角度調整仕様が未確認のため、この種目は提案候補にしません。",
      };
    }
    if (avoidExerciseIds.includes(exercise.id)) {
      return { exercise, available: false, excludedByAvoid: true, unavailableReason: "避けたい種目として設定されています。" };
    }
    const history = allSetsDescByExercise.get(exercise.id) ?? [];
    if (history[0]?.pain) {
      return {
        exercise,
        available: false,
        excludedByPain: true,
        unavailableReason: "前回痛みの申告があったため、自動提案から除外しています。",
      };
    }
    return { exercise, available: true };
  });
}

function estimatedSecondsForExercise(exercise: Exercise, goal: Goal): number {
  const range = exercise.repRangeByGoal[goal];
  return (
    PREP_SECONDS_PER_EXERCISE +
    range.sets * EXEC_SECONDS_PER_SET +
    (range.sets - 1) * REST_SECONDS_BY_GOAL[goal]
  );
}

export interface BuildProposalParams {
  data: AppData;
  selectedMuscles: string[];
  availableMinutes: number;
  now: Date;
}

function lastPerformedAtMs(exerciseId: string, allSetsDescByExercise: Map<string, SetRecord[]>): number {
  const sets = allSetsDescByExercise.get(exerciseId);
  if (!sets || sets.length === 0) return -Infinity;
  return new Date(sets[0].completedAt).getTime();
}

/**
 * 今日の種目候補を作る(処理順序 全体)。
 * 除外理由は各AvailabilityResultに残るため、画面側で「除外した」旨を表示できる。
 */
export function buildProposal(params: BuildProposalParams): { proposal: Proposal; excluded: AvailabilityResult[] } {
  const { data, selectedMuscles, availableMinutes, now } = params;
  const goal = data.personalSettings.goalPrimary ?? "health";
  const dumbbell = getDumbbell(data.equipment);
  const steps = dumbbell?.weightStepsKg ?? [];

  const setsByExercise = new Map<string, SetRecord[]>();
  for (const s of data.setRecords) {
    if (s.deletedAt || s.isWarmup) continue;
    const list = setsByExercise.get(s.exerciseId) ?? [];
    list.push(s);
    setsByExercise.set(s.exerciseId, list);
  }
  for (const list of setsByExercise.values()) {
    list.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }

  const availability = evaluateAvailability(
    data.exercises,
    data.equipment,
    data.personalSettings.avoidMovements ?? [],
    setsByExercise
  );

  const candidates = availability.filter((a) => a.available).map((a) => a.exercise);
  const excluded = availability.filter((a) => !a.available);

  const matchesSelectedMuscle = (ex: Exercise) =>
    selectedMuscles.length === 0 ||
    selectedMuscles.includes(ex.primaryMuscle) ||
    ex.secondaryMuscles.some((m) => selectedMuscles.includes(m));

  const prioritized = [...candidates].sort((a, b) => {
    const aMatch = matchesSelectedMuscle(a) ? 0 : 1;
    const bMatch = matchesSelectedMuscle(b) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return lastPerformedAtMs(a.id, setsByExercise) - lastPerformedAtMs(b.id, setsByExercise);
  });

  let remainingSeconds = availableMinutes * 60;
  const chosen: Exercise[] = [];
  for (const ex of prioritized) {
    if (chosen.length >= MAX_EXERCISES_IN_PROPOSAL) break;
    const est = estimatedSecondsForExercise(ex, goal);
    if (est <= remainingSeconds || chosen.length === 0) {
      chosen.push(ex);
      remainingSeconds -= est;
    }
    if (remainingSeconds <= 0) break;
  }

  const items: ProposalItem[] = chosen.map((exercise) => {
    const history = setsByExercise.get(exercise.id) ?? [];
    if (exercise.loadType === "bodyweight") {
      const s = suggestBodyweight(exercise, goal, history);
      return {
        exerciseId: exercise.id,
        reps: s.reps,
        sets: s.sets,
        pieceCount: s.pieceCount,
        reason: s.reason,
        isInitialAdjustment: s.isInitialAdjustment,
      };
    }
    const s = suggestDumbbellProgression(exercise, goal, steps, history);
    return {
      exerciseId: exercise.id,
      reps: s.reps,
      sets: s.sets,
      weightKg: s.weightKg,
      pieceCount: s.pieceCount,
      reason: s.reason,
      isInitialAdjustment: s.isInitialAdjustment,
    };
  });

  const proposal: Proposal = {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    rulesVersion: RULES_VERSION,
    personalSettingsSnapshot: { ...data.personalSettings },
    referencedSetRecordIds: chosen.flatMap((ex) => (setsByExercise.get(ex.id) ?? []).slice(0, 4).map((s) => s.id)),
    items,
  };

  return { proposal, excluded };
}

export function personalSettingsDefaults(): PersonalSettings {
  return { timezone: "Asia/Tokyo" };
}
