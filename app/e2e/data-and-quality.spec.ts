import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { buildProposal, completeButton, goTo, open, startWorkout, STORAGE_KEY } from "./helpers";

test.describe("初期設定・器具", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await goTo(page, "設定");
  });

  test("器具3種類・ダンベル2個・重量16段階が初期登録されている", async ({ page }) => {
    await expect(page.getByText("可変式ダンベル（フレックスベル）")).toBeVisible();
    await expect(page.getByLabel("個数")).toHaveValue("2");
    const chips = page.getByTestId("weight-steps").locator(".badge");
    await expect(chips).toHaveText(["3kg", "5kg", "7kg", "9kg", "12kg", "14kg", "16kg", "18kg", "21kg", "23kg", "25kg", "27kg", "30kg", "32kg", "34kg", "36kg"]);
    await expect(page.getByText("ベンチ（STEADY ST123）")).toBeVisible();
    await expect(page.getByRole("button", { name: "角度調整の仕様を確認済み" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "保有している" })).toHaveAttribute("aria-pressed", "true");
  });

  test("不正な重量一覧はエラー表示し、初期の16段階に戻せる", async ({ page }) => {
    await page.getByText("重量一覧を編集する").click();
    await page.getByLabel("重量（kg、カンマ区切り）").fill("3, abc");
    await page.getByRole("button", { name: "この内容で更新" }).click();
    await expect(page.getByRole("alert")).toContainText("正の数");
    await page.getByLabel("重量（kg、カンマ区切り）").fill("4, 8");
    await page.getByRole("button", { name: "この内容で更新" }).click();
    await expect(page.getByTestId("weight-steps").locator(".badge")).toHaveCount(2);
    await page.getByRole("button", { name: "初期の16段階に戻す" }).click();
    await expect(page.getByTestId("weight-steps").locator(".badge")).toHaveCount(16);
  });

  test("体重と目標を記録でき、振り返りに体重推移が表示される", async ({ page }) => {
    await page.getByLabel("体重 (kg)", { exact: true }).fill("70.5");
    await page.getByRole("button", { name: "体重を記録" }).click();
    await page.getByLabel("目標体重 (kg)").fill("68");
    await page.getByRole("button", { name: "目標を保存" }).click();
    await expect(page.getByTestId("current-goal")).toHaveText("現在の目標：68kg");
    await goTo(page, "振り返り");
    await expect(page.getByText("70.5kg")).toBeVisible();
  });

  test("プロフィールは入力すると再読込後も保持される", async ({ page }) => {
    await page.getByLabel("年齢").fill("34");
    await page.getByRole("radio", { name: "筋肥大" }).click();
    await page.reload();
    await goTo(page, "設定");
    await expect(page.getByLabel("年齢")).toHaveValue("34");
    await expect(page.getByRole("radio", { name: "筋肥大" })).toBeChecked();
  });
});

test.describe("書き出し・復元", () => {
  test("書き出したJSONに器具・個数・左右が含まれ、消去後に復元すると記録が戻る", async ({ page }, testInfo) => {
    await open(page);
    await startWorkout(page);
    await completeButton(page).click();

    await goTo(page, "設定");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "データを書き出す" }).click()]);
    const file = testInfo.outputPath("backup.json");
    await download.saveAs(file);
    const json = JSON.parse(await readFile(file, "utf8"));
    expect(json.equipment).toHaveLength(3);
    expect(json.equipment.find((e: { type: string }) => e.type === "dumbbell")).toMatchObject({ count: 2 });
    expect(json.equipment.find((e: { type: string }) => e.type === "dumbbell").weightStepsKg).toHaveLength(16);
    expect(json.setRecords[0]).toMatchObject({ pieceCount: 2, side: "both", weightKg: 3, reps: 10 });

    await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
    await page.reload();
    await goTo(page, "振り返り");
    await expect(page.getByText("まだ記録がありません")).toBeVisible();

    await goTo(page, "設定");
    await page.getByTestId("import-file").setInputFiles(file);
    await expect(page.getByRole("dialog", { name: "バックアップを復元" })).toContainText("現在のデータはすべて置き換えられます");
    await page.getByRole("button", { name: "復元する" }).click();
    await expect(page.getByText("復元しました")).toBeVisible();

    await goTo(page, "振り返り");
    await expect(page.getByTestId("stat-sets")).toContainText("1");
    await expect(page.getByText("3kg × 2個").first()).toBeVisible();
  });

  test("壊れたファイルは復元せず、エラーを表示する", async ({ page }) => {
    await open(page);
    await goTo(page, "設定");
    await page.getByTestId("import-file").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("not json") });
    await expect(page.getByRole("alert")).toContainText("JSONの解析に失敗");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("復元のキャンセルではデータが変わらない", async ({ page }, testInfo) => {
    await open(page);
    await goTo(page, "設定");
    await page.getByLabel("年齢").fill("40");
    const file = testInfo.outputPath("empty.json");
    const data = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
    const parsed = JSON.parse(data!);
    parsed.personalSettings.age = 99;
    await (await import("node:fs/promises")).writeFile(file, JSON.stringify(parsed));
    await page.getByTestId("import-file").setInputFiles(file);
    await page.getByRole("button", { name: "キャンセル" }).click();
    await expect(page.getByLabel("年齢")).toHaveValue("40");
  });
});

test.describe("品質・回帰", () => {
  test("crypto.randomUUIDが使えないHTTP環境でも、候補作成〜記録ができる（過去の不具合の回帰）", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, "randomUUID", { value: undefined, configurable: true });
    });
    await open(page);
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
    await startWorkout(page);
    await completeButton(page).click();
    await expect(page.getByRole("list", { name: "記録したセット" }).getByRole("listitem")).toHaveCount(1);
  });

  test("実行時エラーが起きたら、候補作成は失敗理由を画面に表示する", async ({ page }) => {
    await open(page);
    await page.evaluate((k) => {
      const d = JSON.parse(localStorage.getItem(k)!);
      d.exercises[0].repRangeByGoal = null;
      localStorage.setItem(k, JSON.stringify(d));
    }, STORAGE_KEY);
    await page.reload();
    await page.getByRole("button", { name: "今日の候補を作る" }).click();
    await expect(page.getByRole("alert")).toContainText("候補を作れませんでした");
  });

  test("全タブでコンソールエラーがなく、横スクロールも発生しない", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await open(page);
    await startWorkout(page);
    for (const tab of ["今日", "運動中", "振り返り", "設定"] as const) {
      await goTo(page, tab);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${tab}タブで横スクロールが発生`).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });

  test("主要ボタンはタップしやすい大きさ（高さ44px以上）", async ({ page }) => {
    await open(page);
    await startWorkout(page);
    for (const loc of [completeButton(page), page.getByRole("button", { name: "重量を1段階重くする" }), page.getByRole("button", { name: "回数を1増やす" }), page.getByRole("radio", { name: "左右" }).or(page.getByRole("radio").first())]) {
      const box = await loc.first().boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("ダークモードでも背景と文字のコントラストが確保される", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page);
    const [bg, fg] = await page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return [s.backgroundColor, s.color];
    });
    const lum = (c: string) => {
      const [r, g, b] = c.match(/\d+/g)!.map(Number).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (Math.max(lum(bg), lum(fg)) + 0.05) / (Math.min(lum(bg), lum(fg)) + 0.05);
    expect(lum(bg)).toBeLessThan(lum(fg));
    expect(ratio).toBeGreaterThan(7);
    await buildProposal(page);
  });

  test("Escキーでシートを閉じられる", async ({ page }) => {
    await open(page);
    await buildProposal(page);
    await page.getByRole("button", { name: /種目を変える/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
