import { expect, test, type Page } from "@playwright/test";
import { buildProposal, card, open, selectGroup } from "./helpers";

test.beforeEach(async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("bodymap-stage")).toBeVisible();
  // 部位ごとの判定マップの読み込みを待つ(前面は5部位)
  await expect(page.locator(".bodymap[data-ready]")).toHaveAttribute("data-ready", /[5-9]/, { timeout: 10000 });
});

/** 人体図の上の位置(幅・高さの割合)をタップする */
async function tap(page: Page, xr: number, yr: number) {
  const b = (await page.getByTestId("bodymap-stage").boundingBox())!;
  await page.mouse.click(b.x + b.width * xr, b.y + b.height * yr);
}
const hint = (page: Page) => page.locator(".bodymap-hint");

test.describe("人体図で部位を選ぶ", () => {
  test("初期は未選択で、人体模型の画像が表示され、レイヤー画像も読み込めている", async ({ page }) => {
    await expect(hint(page)).toContainText("鍛えたい部位をタップ");
    const base = page.locator("img.bodymap-base");
    await expect.poll(() => base.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    const layers = page.locator("img.bodymap-layer");
    expect(await layers.count()).toBe(5); // 前面: 胸・肩・上腕二頭筋・腹筋・太もも前
    for (let i = 0; i < 5; i++) await expect.poll(() => layers.nth(i).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  });

  test("胸の位置をタップすると「胸」が選ばれ、もう一度タップすると外れる", async ({ page }) => {
    await tap(page, 0.42, 0.33);
    await expect(hint(page)).toHaveText("選択中：胸");
    await expect(page.locator("img.bodymap-on")).toHaveCount(1);
    await tap(page, 0.42, 0.33);
    await expect(hint(page)).toContainText("鍛えたい部位をタップ");
    await expect(page.locator("img.bodymap-on")).toHaveCount(0);
  });

  test("腹筋・太ももの位置をタップして複数選択できる", async ({ page }) => {
    await tap(page, 0.44, 0.47); // 腹筋
    await tap(page, 0.4, 0.68); // 太もも前
    await expect(hint(page)).toHaveText("選択中：腹筋・太もも前");
  });

  test("選んだ部位で候補が絞られる（胸→大胸筋の種目が先頭）", async ({ page }) => {
    await tap(page, 0.42, 0.33);
    await buildProposal(page);
    await expect(page.locator("section.card[aria-label]").first()).toContainText("大胸筋");
  });

  test("「後ろから」に切り替えると背面の人体図になり、背中・お尻などを選べる", async ({ page }) => {
    await page.getByRole("radio", { name: "後ろから" }).click();
    await expect(page.locator("img.bodymap-base")).toHaveAttribute("src", /back\.png/);
    await expect(page.locator(".bodymap[data-ready]")).toHaveAttribute("data-ready", /([5-9]|1\d)/);
    await expect(page.locator("img.bodymap-layer")).toHaveCount(5); // 背面: 肩・背中・上腕三頭筋・お尻・太もも裏
    await tap(page, 0.5, 0.32); // 背中
    await expect(hint(page)).toHaveText("選択中：背中");
  });

  test("前後で選択は保持され、「選択をすべて解除」で空に戻る", async ({ page }) => {
    await tap(page, 0.42, 0.33);
    await page.getByRole("radio", { name: "後ろから" }).click();
    await expect(hint(page)).toHaveText("選択中：胸");
    await page.getByRole("button", { name: "選択をすべて解除" }).click();
    await expect(hint(page)).toContainText("鍛えたい部位をタップ");
  });

  test("何も光っていない場所（背景）をタップしても選択は変わらない", async ({ page }) => {
    await tap(page, 0.03, 0.05);
    await expect(hint(page)).toContainText("鍛えたい部位をタップ");
  });

  test("画面読み上げ用の部位ボタンでも同じ選択ができる（人体図と同期）", async ({ page }) => {
    await selectGroup(page, "肩");
    await expect(hint(page)).toHaveText("選択中：肩");
    await expect(page.getByRole("group", { name: "鍛える部位" }).getByRole("button", { name: "肩", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("全種目の主対象部位が、いずれかの部位を選ぶと候補に出る", async ({ page }) => {
    for (const label of ["胸", "肩", "上腕二頭筋", "腹筋", "太もも前", "背中", "上腕三頭筋", "お尻", "太もも裏"]) {
      await page.reload();
      await selectGroup(page, label);
      await buildProposal(page);
      expect(await page.locator("section.card[aria-label]").count(), label).toBeGreaterThan(0);
      void card;
    }
  });
});
