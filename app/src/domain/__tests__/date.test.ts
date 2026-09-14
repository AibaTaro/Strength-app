import { describe, expect, it } from "vitest";
import { last7DaysPeriod, lastMonthPeriod, subMonthClamped, yesterdayPeriod } from "../date";

describe("期間の計算(Asia/Tokyo)", () => {
  it("前日は前日0時〜当日0時(JST)", () => {
    // 2026-03-15 12:00 JST = 2026-03-15 03:00 UTC
    const now = new Date("2026-03-15T03:00:00Z");
    const p = yesterdayPeriod(now);
    expect(p.startYmd).toEqual({ y: 2026, m: 3, d: 14 });
    expect(p.endYmdInclusive).toEqual({ y: 2026, m: 3, d: 14 });
  });

  it("直近7日は今日を含む7暦日", () => {
    const now = new Date("2026-03-15T03:00:00Z");
    const p = last7DaysPeriod(now);
    expect(p.startYmd).toEqual({ y: 2026, m: 3, d: 9 });
    expect(p.endYmdInclusive).toEqual({ y: 2026, m: 3, d: 15 });
  });

  it("月末は存在する最終日に補正する(3/31の1ヶ月前は2/28)", () => {
    const ymd = subMonthClamped({ y: 2026, m: 3, d: 31 }, 1);
    expect(ymd).toEqual({ y: 2026, m: 2, d: 28 });
  });

  it("直近1か月は1か月前同日の翌日〜今日", () => {
    const now = new Date("2026-03-31T03:00:00Z");
    const p = lastMonthPeriod(now);
    expect(p.startYmd).toEqual({ y: 2026, m: 3, d: 1 });
    expect(p.endYmdInclusive).toEqual({ y: 2026, m: 3, d: 31 });
  });
});
