export function formatWeightLabel(weightKg: number | null | undefined, pieceCount: 1 | 2): string {
  if (weightKg == null) return "自重";
  return `${weightKg}kg × ${pieceCount}個`;
}

export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

export function formatSideLabel(side: "left" | "right" | "both" | "na"): string {
  switch (side) {
    case "left":
      return "左";
    case "right":
      return "右";
    case "both":
      return "両手同時";
    case "na":
      return "-";
  }
}

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: "筋肥大",
  fatloss: "減量",
  strength: "筋力向上",
  health: "健康維持",
};
export function formatGoalLabel(goal?: string): string {
  if (!goal) return "未設定";
  return GOAL_LABELS[goal] ?? goal;
}

const EFFORT_LABELS: Record<string, string> = {
  "0": "あと0回",
  "1": "あと1回",
  "2": "あと2回",
  "3+": "あと3回以上",
  unknown: "不明",
};
export function formatEffortLabel(effort: string): string {
  return EFFORT_LABELS[effort] ?? effort;
}
