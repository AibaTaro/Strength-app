import { expect, test, type Page } from "@playwright/test";
import { buildProposal, card, completeButton, goTo, open, startWorkout, STORAGE_KEY } from "./helpers";

test.beforeEach(async ({ page }) => {
  await open(page);
});

const toggle = (scope: Page | ReturnType<typeof card>, name: string) => scope.getByRole("button", { name: `${name}のやり方を見る` });
const hideButton = (scope: Page | ReturnType<typeof card>, name: string) => scope.getByRole("button", { name: `${name}のやり方を隠す` });

test.describe("やり方アニメーション: 今日の候補", () => {
  test("初期は非表示。「やり方を見る」で表示され、もう一度押すと隠れる", async ({ page }) => {
    await buildProposal(page);
    const bench = card(page, "ダンベルベンチプレス");
    await expect(bench.locator("img.motion-img")).toHaveCount(0);
    await toggle(bench, "ダンベルベンチプレス").click();
    const img = bench.locator("img.motion-img");
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    await hideButton(bench, "ダンベルベンチプレス").click();
    await expect(img).toHaveCount(0);
  });

  test("主に効く部位・補助部位の凡例、フォームの要点、未確認の注意が表示される", async ({ page }) => {
    await buildProposal(page);
    const bench = card(page, "ダンベルベンチプレス");
    await toggle(bench, "ダンベルベンチプレス").click();
    await expect(bench).toContainText("主に効く：大胸筋");
    await expect(bench).toContainText("補助：上腕三頭筋・三角筋前部");
    await expect(bench.getByRole("list", { name: "フォームの要点" }).getByRole("listitem")).toHaveCount(3);
    await expect(bench).toContainText("専門家未確認");
  });

  test("種目ごとに独立して開閉できる", async ({ page }) => {
    await buildProposal(page);
    await toggle(card(page, "ダンベルベンチプレス"), "ダンベルベンチプレス").click();
    await expect(page.locator("img.motion-img")).toHaveCount(1);
    await expect(card(page, "ダンベルショルダープレス").locator("img.motion-img")).toHaveCount(0);
  });

  test("種目を交換すると、交換後の種目のアニメーションを開ける", async ({ page }) => {
    await buildProposal(page);
    await card(page, "ダンベルベンチプレス").getByRole("button", { name: /種目を変える/ }).click();
    await page.getByRole("dialog", { name: "種目を変える" }).getByRole("button", { name: /ダンベルサイドレイズ/ }).click();
    const raise = card(page, "ダンベルサイドレイズ");
    await toggle(raise, "ダンベルサイドレイズ").click();
    await expect(raise.locator("img.motion-img")).toHaveAttribute("src", /dumbbell-lateral-raise\.gif/);
  });
});

test.describe("やり方アニメーション: 運動中", () => {
  test("展開した種目の上部にやり方を表示でき、記録の操作を妨げない", async ({ page }) => {
    await startWorkout(page);
    const bench = card(page, "ダンベルベンチプレス");
    await toggle(bench, "ダンベルベンチプレス").click();
    await expect(bench.locator("img.motion-img")).toBeVisible();
    await completeButton(page).click();
    await expect(page.getByRole("list", { name: "記録したセット" }).getByRole("listitem")).toHaveCount(1);
  });

  test("読み込みに失敗しても案内を表示し、セットは記録できる", async ({ page }) => {
    await page.route("**/motions/*.gif", (r) => r.abort());
    await startWorkout(page);
    await toggle(card(page, "ダンベルベンチプレス"), "ダンベルベンチプレス").click();
    await expect(page.getByText("アニメーションを読み込めませんでした")).toBeVisible();
    await completeButton(page).click();
    await expect(page.getByRole("list", { name: "記録したセット" }).getByRole("listitem")).toHaveCount(1);
  });
});

test.describe("やり方アニメーション: 設定「最初から開く」", () => {
  test("ONにすると今日・運動中で最初から表示され、再読込後も保持、OFFで戻る", async ({ page }) => {
    await goTo(page, "設定");
    await page.getByRole("button", { name: "やり方アニメーションを最初から開く" }).click();
    await page.reload();
    await goTo(page, "設定");
    await expect(page.getByRole("button", { name: "やり方アニメーションを最初から開く" })).toHaveAttribute("aria-pressed", "true");

    await goTo(page, "今日");
    await buildProposal(page);
    await expect(card(page, "ダンベルベンチプレス").locator("img.motion-img")).toBeVisible();
    await page.getByRole("button", { name: /この内容で開始/ }).click();
    await expect(card(page, "ダンベルベンチプレス").locator("img.motion-img")).toBeVisible();

    await goTo(page, "設定");
    await page.getByRole("button", { name: "やり方アニメーションを最初から開く" }).click();
    await goTo(page, "運動中");
    await page.reload();
    await goTo(page, "運動中");
    await expect(page.locator("img.motion-img")).toHaveCount(0);
  });
});

test.describe("やり方アニメーション: 素材の品質", () => {
  test("全種目のGIFがHTTPで取得できる(image/gif)", async ({ page }) => {
    const ids: string[] = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).exercises.map((e: { id: string }) => e.id), STORAGE_KEY);
    expect(ids.length).toBeGreaterThanOrEqual(15);
    for (const id of ids) {
      const res = await page.request.get(`/motions/${id}.gif`);
      expect(res.status(), id).toBe(200);
      expect(res.headers()["content-type"], id).toContain("image/gif");
    }
  });

  test("アニメーションは実際に動いている(時間をおいた表示が変化する)", async ({ page }) => {
    await buildProposal(page);
    const bench = card(page, "ダンベルベンチプレス");
    await toggle(bench, "ダンベルベンチプレス").click();
    const img = bench.locator("img.motion-img");
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    const shots: string[] = [];
    for (let i = 0; i < 4; i++) {
      shots.push((await img.screenshot()).toString("base64"));
      await page.waitForTimeout(450);
    }
    expect(new Set(shots).size).toBeGreaterThan(1);
  });

  test("全種目で、負荷がかかる部位のオレンジ色が画像内に描かれている", async ({ page }) => {
    const ids: string[] = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).exercises.map((e: { id: string }) => e.id), STORAGE_KEY);
    const counts = await page.evaluate(async (list) => {
      const out: Record<string, number> = {};
      for (const id of list) {
        const img = new Image();
        img.src = `/motions/${id}.gif`;
        await img.decode();
        let best = 0;
        // アニメーション中の数時点をサンプルし、最大値を採る
        for (let t = 0; t < 4; t++) {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 60 && d[i + 1] < 150 && d[i + 2] < 90) n++;
          best = Math.max(best, n);
          await new Promise((r) => setTimeout(r, 350));
        }
        out[id] = best;
      }
      return out;
    }, ids);
    for (const [id, n] of Object.entries(counts)) expect(n, `${id} のオレンジ画素数`).toBeGreaterThan(40);
  });
});

test("素材(BodyParts3D, CC BY-SA)のクレジットが設定画面に表示される", async ({ page }) => {
  await goTo(page, "設定");
  await expect(page.getByText("BodyParts3D")).toBeVisible();
  await expect(page.getByText("CC Attribution-Share Alike 2.1 Japan")).toBeVisible();
});
