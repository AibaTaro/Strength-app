import { expect, test } from "@playwright/test";
import { buildProposal, card, goTo, mutateData, open, seedTwoSessions } from "./helpers";

test.beforeEach(async ({ page }) => {
  await open(page);
});

test.describe("今日の候補", () => {
  test("履歴がなければ全種目が「初回調整」で最小重量3kgから始まる", async ({ page }) => {
    await buildProposal(page);
    const cards = page.locator("section.card[aria-label]");
    expect(await cards.count()).toBeGreaterThan(0);
    const bench = card(page, "ダンベルベンチプレス");
    await expect(bench).toContainText("初回調整");
    await expect(bench).toContainText("3kg × 2個");
    await expect(bench).toContainText("教材 未確認");
  });

  test("ベンチ角度が未確認の間は、インクライン種目を候補に出さず理由を表示する", async ({ page }) => {
    await buildProposal(page);
    await expect(card(page, "ダンベルインクラインベンチプレス")).toHaveCount(0);
    await page.getByText(/候補から除外した種目/).click();
    await expect(page.getByText(/ベンチの角度調整仕様が未確認/)).toBeVisible();
  });

  test("ベンチ角度を確認済みにするとインクライン種目が候補に出る", async ({ page }) => {
    await goTo(page, "設定");
    await page.getByRole("button", { name: "角度調整の仕様を確認済み" }).click();
    await goTo(page, "今日");
    await page.getByRole("button", { name: "大胸筋上部", exact: true }).click();
    await buildProposal(page);
    await expect(card(page, "ダンベルインクラインベンチプレス")).toBeVisible();
  });

  test("部位を選ぶと、その部位の種目が先頭に来る", async ({ page }) => {
    await page.getByRole("button", { name: "上腕二頭筋", exact: true }).click();
    await buildProposal(page);
    await expect(page.locator("section.card[aria-label]").first()).toContainText("上腕二頭筋");
  });

  test("種目を交換でき、交換後の種目に提案値が再計算される", async ({ page }) => {
    await buildProposal(page);
    const first = page.locator("section.card[aria-label]").first();
    await first.getByRole("button", { name: /種目を変える/ }).click();
    await page.getByRole("dialog", { name: "種目を変える" }).getByRole("button", { name: /ダンベルサイドレイズ/ }).click();
    await expect(card(page, "ダンベルサイドレイズ")).toContainText("3kg × 2個");
    await expect(card(page, "ダンベルベンチプレス")).toHaveCount(0);
  });

  test("種目を外すと件数が減り、開始ボタンの種目数も更新される", async ({ page }) => {
    await buildProposal(page);
    const cards = page.locator("section.card[aria-label]");
    const before = await cards.count();
    await cards.first().getByRole("button", { name: "外す" }).click();
    await expect(cards).toHaveCount(before - 1);
    await expect(page.getByRole("button", { name: new RegExp(`開始（${before - 1}種目）`) })).toBeVisible();
  });

  test("全種目を「避けたい種目」にすると、0件の理由をメッセージで表示する", async ({ page }) => {
    await goTo(page, "設定");
    const chips = page.getByRole("group", { name: "避けたい種目" }).getByRole("button");
    const n = await chips.count();
    for (let i = 0; i < n; i++) await chips.nth(i).click();
    await goTo(page, "今日");
    await page.getByRole("button", { name: "今日の候補を作る" }).click();
    await expect(page.getByRole("alert")).toContainText("条件に合う種目がありません");
  });

  test("目的を「筋力向上」にすると回数・セット数が目的に合わせて変わる", async ({ page }) => {
    await goTo(page, "設定");
    await page.getByRole("radio", { name: "筋力" }).click();
    await goTo(page, "今日");
    await buildProposal(page);
    await expect(card(page, "ダンベルベンチプレス")).toContainText("4回 × 4セット");
  });

  test("目的が未設定のあいだは案内が出て、設定画面へ移動できる", async ({ page }) => {
    await expect(page.getByText("目的が未設定です")).toBeVisible();
    await page.getByRole("button", { name: "設定を開く" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "設定" })).toBeVisible();
  });
});

test.describe("重量の増量ロジック(16段階)", () => {
  async function setGoalHypertrophy(page: import("@playwright/test").Page) {
    await goTo(page, "設定");
    await page.getByRole("radio", { name: "筋肥大" }).click();
    await goTo(page, "今日");
  }

  test("複合種目: 直近2回が上限回数・余力ありなら 9kg → 12kg（11kgは出さない）", async ({ page }) => {
    await setGoalHypertrophy(page);
    await mutateData(page, seedTwoSessions("dumbbell-bench-press", 9, 2, 12));
    await page.getByRole("button", { name: "大胸筋", exact: true }).click();
    await buildProposal(page);
    const bench = card(page, "ダンベルベンチプレス");
    await expect(bench).toContainText("12kg × 2個");
    await expect(bench).not.toContainText("11kg");
    await expect(bench).toContainText("増量");
  });

  test("アイソレーション種目: 18→21kgは刻み+3kgが上限2kgを超えるため据え置き", async ({ page }) => {
    await setGoalHypertrophy(page);
    await mutateData(page, seedTwoSessions("dumbbell-curl", 18, 2, 15));
    await page.getByRole("button", { name: "上腕二頭筋", exact: true }).click();
    await buildProposal(page);
    const curl = card(page, "ダンベルカール");
    await expect(curl).toContainText("18kg × 2個");
    await expect(curl).toContainText("据え置き");
  });

  test("最大重量36kgに達していても増量を強制しない", async ({ page }) => {
    await setGoalHypertrophy(page);
    await mutateData(page, seedTwoSessions("dumbbell-bench-press", 36, 2, 12));
    await page.getByRole("button", { name: "大胸筋", exact: true }).click();
    await buildProposal(page);
    const bench = card(page, "ダンベルベンチプレス");
    await expect(bench).toContainText("36kg × 2個");
    await expect(bench).toContainText("最大重量");
  });

  test("登録した重量一覧を変更すると、初回提案の重量に反映される", async ({ page }) => {
    await goTo(page, "設定");
    await page.getByText("重量一覧を編集する").click();
    await page.getByLabel("重量（kg、カンマ区切り）").fill("4, 8, 15");
    await page.getByRole("button", { name: "この内容で更新" }).click();
    await goTo(page, "今日");
    await buildProposal(page);
    await expect(card(page, "ダンベルベンチプレス")).toContainText("4kg × 2個");
  });
});
