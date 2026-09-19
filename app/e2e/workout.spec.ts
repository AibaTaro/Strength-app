import { expect, test } from "@playwright/test";
import { card, completeButton, completeSet, goTo, mutateData, open, startWorkout, buildProposal } from "./helpers";

test.beforeEach(async ({ page }) => {
  await open(page);
});

const weightValue = (page: import("@playwright/test").Page) => page.getByTestId("weight-value");
const plus = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "重量を1段階重くする" });
const minus = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "重量を1段階軽くする" });

test.describe("セット記録", () => {
  test("候補から開始し、1セット記録すると進捗と休憩タイマーが始まる", async ({ page }) => {
    await startWorkout(page);
    const bench = card(page, "ダンベルベンチプレス");
    await completeButton(page).click();
    await expect(bench.getByLabel(/1 \/ 2 セット完了/)).toBeVisible();
    await expect(page.getByRole("timer", { name: "休憩タイマー" })).toBeVisible();
    await expect(page.getByTestId("rest-remaining")).toHaveText(/1:(30|29)/);
  });

  test("記録は再読込しても残り、セッションも継続する", async ({ page }) => {
    await startWorkout(page);
    await completeButton(page).click();
    await page.reload();
    await expect(page.getByRole("navigation").getByRole("button", { name: "運動中（実施中）" })).toBeVisible();
    await goTo(page, "運動中");
    await expect(page.getByRole("list", { name: "記録したセット" }).getByRole("listitem")).toHaveCount(1);
    await expect(page.getByTestId("set-text")).toHaveText(/^3kg × 2個 · 10回/);
  });

  test("二重タップしても1セットしか記録されない", async ({ page }) => {
    await startWorkout(page);
    await completeButton(page).dblclick();
    await expect(page.getByRole("list", { name: "記録したセット" }).getByRole("listitem")).toHaveCount(1);
  });

  test("休憩タイマーは +15秒 と スキップ ができる", async ({ page }) => {
    await startWorkout(page);
    await completeButton(page).click();
    await page.getByRole("button", { name: "+15秒" }).click();
    await expect(page.getByTestId("rest-remaining")).toHaveText(/1:(4\d)/);
    await page.getByRole("button", { name: "スキップ" }).click();
    await expect(page.getByRole("timer")).toHaveCount(0);
  });

  test("目標セット数を終えると、次の未完了の種目が自動で開く", async ({ page }) => {
    await startWorkout(page);
    await completeSet(page);
    await page.getByRole("button", { name: "スキップ" }).click();
    await completeSet(page);
    await expect(card(page, "ダンベルベンチプレス").getByRole("button", { expanded: true })).toHaveCount(0);
    await expect(card(page, "ダンベルショルダープレス").getByRole("button", { name: /ダンベルショルダープレス/, expanded: true })).toBeVisible();
  });

  test("セットを削除して「元に戻す」で復元できる", async ({ page }) => {
    await startWorkout(page);
    await completeButton(page).click();
    const list = page.getByRole("list", { name: "記録したセット" });
    await page.getByRole("button", { name: "セット1を削除" }).click();
    await expect(list).toHaveCount(0);
    await page.getByRole("button", { name: "元に戻す" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
  });

  test("記録したセットを編集できる", async ({ page }) => {
    await startWorkout(page);
    await completeButton(page).click();
    await page.getByRole("button", { name: "セット1を編集" }).click();
    await plus(page).click();
    await page.getByRole("button", { name: "この内容に更新" }).click();
    await expect(page.getByTestId("set-text")).toHaveText(/^5kg × 2個 · 10回/);
  });

  test("種目を手動で選んで始められる（候補なし）", async ({ page }) => {
    await goTo(page, "運動中");
    await page.getByRole("button", { name: "種目を選んで始める" }).click();
    await page.getByRole("dialog", { name: "種目を追加" }).getByRole("button", { name: /ゴブレットスクワット/ }).click();
    await expect(card(page, "ゴブレットスクワット")).toBeVisible();
    await completeButton(page).click();
    await expect(page.getByRole("list", { name: "記録したセット" })).toContainText("1個");
  });

  test("ベンチ角度が必要な種目は手動追加でも選べない", async ({ page }) => {
    await goTo(page, "運動中");
    await page.getByRole("button", { name: "種目を選んで始める" }).click();
    const row = page.getByRole("dialog", { name: "種目を追加" }).getByRole("button", { name: /インクライン/ });
    await expect(row).toBeDisabled();
  });
});

test.describe("重量ステッパー（16段階）", () => {
  test("3→5→7→9→12 と進み、11kgは選べない。戻すと9kgに戻る", async ({ page }) => {
    await startWorkout(page);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      await plus(page).click();
      seen.push((await weightValue(page).textContent()) ?? "");
    }
    expect(seen).toEqual(["5", "7", "9", "12"]);
    await minus(page).click();
    await expect(weightValue(page)).toHaveText("9");
  });

  test("最小3kg・最大36kgで止まり、その表示が出る", async ({ page }) => {
    await startWorkout(page);
    await expect(minus(page)).toBeDisabled();
    await expect(page.getByText("最小重量")).toBeVisible();
    while (await plus(page).isEnabled()) await plus(page).click();
    await expect(weightValue(page)).toHaveText("36");
    await expect(page.getByText("最大重量")).toBeVisible();
  });
});

test.describe("負荷量の集計（二重計上しない）", () => {
  async function setWeight12(page: import("@playwright/test").Page) {
    while ((await weightValue(page).textContent()) !== "12") await plus(page).click();
  }

  test("2個使用・片手12kg・10回 = 240kg", async ({ page }) => {
    await startWorkout(page);
    await setWeight12(page);
    await completeButton(page).click();
    await goTo(page, "振り返り");
    await expect(page.getByText("12kg × 2個").first()).toContainText("負荷量240kg");
  });

  test("1個を両手で持つ・12kg・10回 = 120kg", async ({ page }) => {
    await startWorkout(page);
    await setWeight12(page);
    await page.getByRole("radio", { name: /1個（両手で持つ）/ }).click();
    await completeButton(page).click();
    await goTo(page, "振り返り");
    await expect(page.getByText("12kg × 1個").first()).toContainText("負荷量120kg");
  });

  test("片手ずつ・12kg・左右各10回 = 合計240kg（左右で自動切替）", async ({ page }) => {
    await startWorkout(page);
    await card(page, "ダンベルワンハンドロウ").getByRole("button", { name: /ダンベルワンハンドロウ/ }).click();
    await setWeight12(page);
    await expect(page.getByRole("radio", { name: "左" })).toBeChecked();
    await completeSet(page);
    await page.getByRole("button", { name: "スキップ" }).click();
    await expect(page.getByRole("radio", { name: "右" })).toBeChecked();
    await completeSet(page);
    await goTo(page, "振り返り");
    const rows = page.getByText("12kg × 1個");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("負荷量120kg");
    await expect(rows.nth(1)).toContainText("負荷量120kg");
  });

  test("プッシュバーの自重種目は負荷量を計算しない", async ({ page }) => {
    await startWorkout(page);
    await card(page, "腕立て伏せ（プッシュバー使用）").getByRole("button", { name: /腕立て伏せ/ }).click();
    await completeButton(page).click();
    await goTo(page, "振り返り");
    const row = page.getByText("自重 ・").first();
    await expect(row).toBeVisible();
    await expect(row).not.toContainText("負荷量");
  });
});

test.describe("時間管理", () => {
  test("一時停止中は経過時間が進まず、再開すると進む", async ({ page }) => {
    await startWorkout(page);
    await page.getByRole("button", { name: "一時停止" }).click();
    await expect(page.getByText("一時停止中")).toBeVisible();
    const t1 = await page.getByTestId("elapsed").textContent();
    await page.waitForTimeout(2200);
    expect(await page.getByTestId("elapsed").textContent()).toBe(t1);
    await page.getByRole("button", { name: "再開" }).click();
    await expect(page.getByTestId("elapsed")).not.toHaveText(t1 ?? "", { timeout: 4000 });
  });

  test("画面を再読込しても経過時間は時刻差から復元される", async ({ page }) => {
    await startWorkout(page);
    await page.waitForTimeout(2200);
    await page.reload();
    await goTo(page, "運動中");
    await expect(page.getByTestId("elapsed")).not.toHaveText("0:00");
    await expect(page.getByTestId("elapsed")).not.toHaveText("0:01");
  });

  test("終了すると確認シートが出て、振り返り画面に集計される", async ({ page }) => {
    await startWorkout(page);
    await completeButton(page).click();
    await page.getByRole("button", { name: "終了", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "セッションを終了" })).toContainText("1セット");
    await page.getByRole("button", { name: "終了して振り返る" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "振り返り" })).toBeVisible();
    await expect(page.getByTestId("stat-sets")).toContainText("1");
    await expect(page.getByTestId("stat-days")).toContainText("1");
    await expect(page.getByRole("navigation").getByRole("button", { name: "運動中" })).toBeVisible();
  });

  test("「続ける」を選ぶとセッションは終了しない", async ({ page }) => {
    await startWorkout(page);
    await page.getByRole("button", { name: "終了", exact: true }).click();
    await page.getByRole("button", { name: "続ける" }).click();
    await expect(page.getByTestId("elapsed")).toBeVisible();
  });
});

test.describe("痛みの申告", () => {
  test("痛みを申告した種目は、次回の自動候補から除外され理由が表示される", async ({ page }) => {
    await startWorkout(page);
    await page.getByRole("button", { name: "痛みがある" }).click();
    await completeButton(page).click();
    await expect(page.getByRole("list", { name: "記録したセット" })).toContainText("痛み");
    await page.getByRole("button", { name: "終了", exact: true }).click();
    await page.getByRole("button", { name: "終了して振り返る" }).click();
    await goTo(page, "今日");
    await buildProposal(page);
    await expect(card(page, "ダンベルベンチプレス")).toHaveCount(0);
    await page.getByText(/候補から除外した種目/).click();
    await expect(page.getByText(/前回痛みの申告があった/)).toBeVisible();
  });

  test("痛みがあった種目は、手動なら選べるが警告が出る", async ({ page }) => {
    await startWorkout(page);
    await page.getByRole("button", { name: "痛みがある" }).click();
    await completeButton(page).click();
    await page.getByRole("button", { name: "終了", exact: true }).click();
    await page.getByRole("button", { name: "終了して振り返る" }).click();
    await goTo(page, "運動中");
    await page.getByRole("button", { name: "種目を選んで始める" }).click();
    await expect(page.getByRole("dialog", { name: "種目を追加" }).getByRole("button", { name: /ダンベルベンチプレス/ })).toContainText("痛みの申告あり");
  });
});

test.describe("期間集計", () => {
  test("前日・直近7日・直近1か月の件数が期間ごとに正しく分かれる", async ({ page }) => {
    await mutateData(
      page,
      `const now = Date.now();
       [1, 3, 20].forEach((d, i) => data.setRecords.push({
         id: 'p' + i, sessionId: 'ps' + i, exerciseId: 'goblet-squat', order: 0, side: 'na',
         weightKg: 12, pieceCount: 1, reps: 10, effort: '2', pain: false, isWarmup: false,
         completedAt: new Date(now - d * 86400000).toISOString(), updatedVersion: 1 }));`
    );
    await goTo(page, "振り返り");
    await page.getByRole("radio", { name: "前日" }).click();
    await expect(page.getByTestId("stat-sets")).toContainText("1");
    await page.getByRole("radio", { name: "直近7日" }).click();
    await expect(page.getByTestId("stat-sets")).toContainText("2");
    await page.getByRole("radio", { name: "直近1か月" }).click();
    await expect(page.getByTestId("stat-sets")).toContainText("3");
    await expect(page.getByTestId("stat-days")).toContainText("3");
  });

  test("記録が空のときは空状態を表示し、0や体重0を補完しない", async ({ page }) => {
    await goTo(page, "振り返り");
    await expect(page.getByText("まだ記録がありません")).toBeVisible();
    await expect(page.getByText("記録なし（設定タブで体重を記録できます）")).toBeVisible();
  });

  test("履歴の記録を削除して元に戻せる", async ({ page }) => {
    await startWorkout(page);
    await completeButton(page).click();
    await goTo(page, "振り返り");
    await page.getByRole("button", { name: "ダンベルベンチプレスの記録を削除" }).click();
    await expect(page.getByText("まだ記録がありません")).toBeVisible();
    await page.getByRole("button", { name: "元に戻す" }).click();
    await expect(page.getByTestId("stat-sets")).toContainText("1");
  });
});
