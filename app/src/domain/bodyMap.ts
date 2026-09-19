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
