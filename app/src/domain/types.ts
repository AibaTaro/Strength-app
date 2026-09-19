// ドメイン型定義。仕様: strength-app-plan.md

export type EquipmentType = "dumbbell" | "bench" | "pushUpBar";

export interface DumbbellEquipment {
  id: string;
  type: "dumbbell";
  name: string;
  count: number;
  /** 片手あたりの利用可能重量(kg)。16段階固定。ここを推測で書き換えない。 */
  weightStepsKg: number[];
}

export interface BenchEquipment {
  id: string;
  type: "bench";
  name: string;
  /** 角度調整の仕様が公式情報で確認できているか */
  angleConfirmed: boolean;
  availableAngles?: string[];
}

export interface PushUpBarEquipment {
  id: string;
  type: "pushUpBar";
  name: string;
}

export type Equipment = DumbbellEquipment | BenchEquipment | PushUpBarEquipment;

export type Side = "left" | "right" | "both" | "na";

export type Goal = "hypertrophy" | "fatloss" | "strength" | "health";

export type Experience = "beginner" | "intermediate" | "advanced";

export type Effort = "0" | "1" | "2" | "3+" | "unknown";

export type MaterialStatus = "confirmed" | "unconfirmed";

export interface RepRangeSetting {
  minReps: number;
  maxReps: number;
  sets: number;
  /** 増量できる最大の刻み幅(kg)。これを超える刻みでは自動増量しない。 */
  maxIncrementKg: number;
}

export type LoadType = "dumbbellPerHand" | "bodyweight";

export interface Exercise {
  id: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  requiredEquipment: EquipmentType[];
  /** ベンチの角度指定が必要か。trueの場合、ベンチ角度が未確認の間は「利用可能」と断定しない */
  requiresBenchAngle: boolean;
  loadType: LoadType;
  unilateral: boolean;
  /** ダンベル種目の基本使用個数(1個 or 2個)。実績側で変更可能。 */
  defaultPieceCount: 1 | 2;
  formTips: string[];
  commonMistakes: string[];
  alternativeExerciseIds: string[];
  materialStatus: MaterialStatus;
  materialUrl?: string;
  materialSource?: string;
  repRangeByGoal: Record<Goal, RepRangeSetting>;
  description: string;
}

export interface PersonalSettings {
  age?: number;
  heightCm?: number;
  goalPrimary?: Goal;
  goalSecondary?: string;
  experience?: Experience;
  frequencyPerWeek?: number;
  sessionMinutes?: number;
  avoidMovements?: string[];
  /** やり方アニメーションを最初から開いておく(既定=閉じる) */
  showMotionByDefault?: boolean;
  timezone: string;
}

export interface WeightHistoryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
  bodyFatPct?: number;
  recordedAt: string; // ISO
}

export interface GoalHistoryEntry {
  id: string;
  targetWeightKg?: number;
  maintain: boolean;
  goalPrimary: Goal;
  goalSecondary?: string;
  setAt: string; // ISO
}

export interface ProposalItem {
  exerciseId: string;
  reps: number;
  sets: number;
  weightKg?: number;
  pieceCount?: 1 | 2;
  reason: string;
  isInitialAdjustment: boolean;
}

export interface Proposal {
  id: string;
  createdAt: string;
  rulesVersion: string;
  personalSettingsSnapshot: PersonalSettings;
  referencedSetRecordIds: string[];
  items: ProposalItem[];
}

export interface PausedInterval {
  start: string;
  end?: string;
}

export type SessionStatus = "active" | "paused" | "completed";

export interface WorkoutSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  pausedIntervals: PausedInterval[];
  status: SessionStatus;
  fatigue?: "low" | "mid" | "high";
  /** このセッションの元になった提案(種目提案・記録・個人設定を連携させるための参照) */
  proposalId?: string;
}

export interface SetRecord {
  id: string;
  sessionId: string;
  exerciseId: string;
  order: number;
  side: Side;
  /** ダンベル1個あたりの重量(kg)。自重種目はnull。 */
  weightKg: number | null;
  /** 使用個数。ダンベル以外は1固定。 */
  pieceCount: 1 | 2;
  reps: number;
  effort: Effort;
  pain: boolean;
  isWarmup: boolean;
  completedAt: string; // ISO
  updatedVersion: number;
  deletedAt?: string;
}

export interface AppData {
  schemaVersion: number;
  equipment: Equipment[];
  exercises: Exercise[];
  personalSettings: PersonalSettings;
  weightHistory: WeightHistoryEntry[];
  goalHistory: GoalHistoryEntry[];
  proposals: Proposal[];
  sessions: WorkoutSession[];
  setRecords: SetRecord[];
}
