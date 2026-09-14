// 日付・期間の計算。タイムゾーンは常にAsia/Tokyo(JST, UTC+9, 夏時間なし)を使う。

export interface Ymd {
  y: number;
  m: number; // 1-12
  d: number;
}

export function getJstYmd(date: Date): Ymd {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return { y, m, d };
}

export function ymdToKey(ymd: Ymd): string {
  const mm = String(ymd.m).padStart(2, "0");
  const dd = String(ymd.d).padStart(2, "0");
  return `${ymd.y}-${mm}-${dd}`;
}

/** 指定した日本時間の暦日の0時(JST)に対応するUTCミリ秒 */
export function jstMidnightUtcMs(ymd: Ymd): number {
  return Date.UTC(ymd.y, ymd.m - 1, ymd.d) - 9 * 3600 * 1000;
}

export function addDays(ymd: Ymd, delta: number): Ymd {
  const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** 1ヶ月前の同日。月末が存在しない場合はその月の最終日に補正する。 */
export function subMonthClamped(ymd: Ymd, months: number): Ymd {
  let ny = ymd.y;
  let nm = ymd.m - months;
  while (nm < 1) {
    nm += 12;
    ny -= 1;
  }
  const lastDayOfTargetMonth = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(ymd.d, lastDayOfTargetMonth);
  return { y: ny, m: nm, d: nd };
}

export interface Period {
  label: string;
  /** 開始(この時刻を含む)、UTCミリ秒 */
  startMs: number;
  /** 終了(この時刻を含まない)、UTCミリ秒 */
  endMs: number;
  startYmd: Ymd;
  endYmdInclusive: Ymd;
}

function period(label: string, startYmd: Ymd, endYmdInclusive: Ymd): Period {
  return {
    label,
    startMs: jstMidnightUtcMs(startYmd),
    endMs: jstMidnightUtcMs(addDays(endYmdInclusive, 1)),
    startYmd,
    endYmdInclusive,
  };
}

export function yesterdayPeriod(now: Date): Period {
  const today = getJstYmd(now);
  const y = addDays(today, -1);
  return period("前日", y, y);
}

export function last7DaysPeriod(now: Date): Period {
  const today = getJstYmd(now);
  const start = addDays(today, -6);
  return period("直近7日", start, today);
}

export function lastMonthPeriod(now: Date): Period {
  const today = getJstYmd(now);
  const oneMonthAgo = subMonthClamped(today, 1);
  const start = addDays(oneMonthAgo, 1);
  return period("直近1か月", start, today);
}

/** periodの直前・同じ日数の比較期間 */
export function previousComparablePeriod(p: Period): Period {
  const lengthDays =
    Math.round((jstMidnightUtcMs(addDays(p.endYmdInclusive, 1)) - jstMidnightUtcMs(p.startYmd)) / 86400000);
  const endYmdInclusive = addDays(p.startYmd, -1);
  const startYmd = addDays(endYmdInclusive, -(lengthDays - 1));
  return period(`${p.label}(比較)`, startYmd, endYmdInclusive);
}
