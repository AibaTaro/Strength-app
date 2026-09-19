import groups from "./bodyGroups.json";

/** 人体図で選べる部位。names は種目データの主対象部位名(exercises.ts)と対応する。 */
export interface BodyGroup {
  id: string;
  label: string;
  views: ("front" | "back")[];
  names: string[];
}
export const BODY_GROUPS = groups as (BodyGroup & { regions: string[] })[];

/** 選択した部位(id)から、種目の絞り込みに使う筋肉名の一覧を返す */
export function muscleNamesOf(groupIds: string[]): string[] {
  return BODY_GROUPS.filter((g) => groupIds.includes(g.id)).flatMap((g) => g.names);
}

export interface AutoPick {
  id: string;
  label: string;
  /** 最後に鍛えてからの日数。一度も鍛えていなければnull */
  days: number | null;
}

/**
 * おまかせ: 最後に鍛えてから最も日数が空いている(未実施を最優先)部位を count 個選ぶ。
 * 同順位は BODY_GROUPS の並び順。準備セット・削除済みは数えない。
 */
export function suggestGroups(
  setRecords: { exerciseId: string; completedAt: string; isWarmup: boolean; deletedAt?: string }[],
  exercises: { id: string; primaryMuscle: string }[],
  now: Date,
  count = 2
): AutoPick[] {
  const muscleOf = new Map(exercises.map((e) => [e.id, e.primaryMuscle]));
  const picks = BODY_GROUPS.map((g) => {
    let last = -Infinity;
    for (const s of setRecords) {
      if (s.deletedAt || s.isWarmup) continue;
      const m = muscleOf.get(s.exerciseId);
      if (m && g.names.includes(m)) last = Math.max(last, new Date(s.completedAt).getTime());
    }
    const days = last === -Infinity ? null : Math.floor((now.getTime() - last) / 86400000);
    return { id: g.id, label: g.label, days };
  });
  return picks
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.days ?? Infinity) - (a.p.days ?? Infinity) || a.i - b.i)
    .slice(0, count)
    .map((x) => x.p);
}

export function describeAutoPick(picks: AutoPick[]): string {
  return `おまかせ：${picks.map((p) => `${p.label}（${p.days === null ? "まだ記録なし" : p.days === 0 ? "今日実施済み" : `${p.days}日ぶり`}）`).join("・")}`;
}
