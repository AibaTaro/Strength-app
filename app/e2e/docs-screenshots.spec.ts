import { test, type Locator, type Page } from "@playwright/test";
import { buildProposal, completeButton, goTo, mutateData, open, startWorkout } from "./helpers";

// 画面仕様書用の注釈付きスクリーンショットを生成する。`npm run docs:shots` でのみ実行。
test.skip(!process.env.DOCS_SHOTS, "DOCS_SHOTS=1 のときだけ実行");
test.use({ deviceScaleFactor: 1.5 });

const OUT = "../docs/screenshots";

async function annotate(page: Page, targets: Locator[], figure: string) {
  const boxes = [];
  for (const t of targets) boxes.push(await t.first().boundingBox());
  await page.evaluate(([bs, fig]) => {
    const tag = document.createElement("div");
    tag.textContent = fig as string;
    tag.style.cssText = "position:absolute;right:10px;top:10px;padding:2px 12px;border-radius:8px;background:#0f172a;color:#fff;font:700 15px/26px sans-serif;z-index:10000";
    document.body.append(tag);
    (bs as ({ x: number; y: number; width: number; height: number } | null)[]).forEach((b, i) => {
      if (!b) return;
      const y = b.y + window.scrollY;
      const frame = document.createElement("div");
      frame.style.cssText = `position:absolute;left:${b.x - 3}px;top:${y - 3}px;width:${b.width + 6}px;height:${b.height + 6}px;border:2px solid #e11d48;border-radius:10px;pointer-events:none;z-index:9999`;
      const n = document.createElement("div");
      n.textContent = String(i + 1);
      n.style.cssText = `position:absolute;left:${b.x - 10}px;top:${y - 10}px;width:22px;height:22px;border-radius:50%;background:#e11d48;color:#fff;font:700 13px/22px sans-serif;text-align:center;pointer-events:none;z-index:10000`;
      document.body.append(frame, n);
    });
  }, [boxes, figure] as const);
}

async function shot(page: Page, name: string, figure: string, height: number, targets: Locator[]) {
  await page.setViewportSize({ width: 412, height });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await annotate(page, targets, figure);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test("今日画面", async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 412, height: 3400 });
  await page.waitForTimeout(800);
  const stage = page.getByTestId("bodymap-stage").boundingBox();
  const sb = (await stage)!;
  await page.mouse.click(sb.x + sb.width * 0.42, sb.y + sb.height * 0.33); // 胸を選んだ状態にする
  await buildProposal(page);
  const card = page.locator("section.card[aria-label]").first();
  await shot(page, "today", "図3", 3400, [
    page.locator(".bodymap"),
    page.getByRole("radiogroup", { name: "使える時間" }),
    page.getByRole("radiogroup", { name: "今日の疲労" }),
    page.getByRole("button", { name: "今日の候補を作る" }),
    card.locator(".spec"),
    card.locator(".badges"),
    card.locator(".reason"),
    card.getByRole("button", { name: /種目を変える/ }),
    page.getByRole("button", { name: /この内容で開始/ }),
  ]);
});

test("運動中画面", async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 412, height: 1500 });
  await startWorkout(page);
  await completeButton(page).click();
  const body = page.locator(".ex-body").first();
  await shot(page, "workout", "図5", 1500, [
    page.locator(".session-bar"),
    page.locator(".progress-ring").first(),
    body.getByRole("list", { name: "記録したセット" }),
    body.getByRole("group", { name: "重量" }),
    body.getByRole("radiogroup", { name: "使用個数" }),
    body.getByRole("group", { name: "回数" }),
    body.getByRole("radiogroup", { name: "余力" }),
    body.locator(".chips"),
    completeButton(page),
    page.getByRole("timer"),
  ]);
});

test("振り返り画面", async ({ page }) => {
  await open(page);
  await mutateData(
    page,
    `const now=Date.now(); ['goblet-squat','dumbbell-bench-press','dumbbell-curl'].forEach((ex,i)=>{for(let k=0;k<3;k++)data.setRecords.push({id:'s'+i+k,sessionId:'x'+i,exerciseId:ex,order:k,side:ex==='goblet-squat'?'na':'both',weightKg:12+i*3,pieceCount:ex==='goblet-squat'?1:2,reps:10,effort:'2',pain:false,isWarmup:false,completedAt:new Date(now-i*86400000-k*60000).toISOString(),updatedVersion:1});}); data.weightHistory.push({id:'w1',date:'2026-09-10',weightKg:71.2,recordedAt:new Date().toISOString()},{id:'w2',date:'2026-09-17',weightKg:70.4,recordedAt:new Date().toISOString()});`
  );
  await page.setViewportSize({ width: 412, height: 2400 });
  await goTo(page, "振り返り");
  await shot(page, "history", "図6", 2400, [
    page.getByRole("radiogroup", { name: "集計期間" }),
    page.getByTestId("period-range"),
    page.locator(".stat-grid"),
    page.locator("section.card", { hasText: "負荷量＝" }),
    page.locator("section.card", { has: page.locator(".badge-info") }).first(),
    page.locator("section.card", { hasText: "70.4kg" }),
    page.locator("section.card", { has: page.locator(".day-head") }).first(),
  ]);
});

test("設定画面", async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 412, height: 3100 });
  await goTo(page, "設定");
  const cards = page.locator(".screen > section.card");
  await shot(page, "settings", "図7", 3100, [0, 1, 2, 3, 4, 5, 6].map((i) => cards.nth(i)));
});

test("やり方アニメーション", async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 412, height: 1500 });
  await buildProposal(page);
  const card = page.getByRole("region", { name: "ダンベルベンチプレス" });
  await card.getByRole("button", { name: /やり方を見る/ }).click();
  await card.locator("img.motion-img").waitFor();
  await page.waitForTimeout(500);
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.querySelector('section[aria-label="ダンベルベンチプレス"]')!.getBoundingClientRect().top + window.scrollY - 70));
  await page.setViewportSize({ width: 412, height: 1100 });
  await page.waitForTimeout(300);
  const panel = card.locator(".motion-panel");
  await annotate(page, [
    card.getByRole("button", { name: /やり方を隠す/ }),
    card.locator("img.motion-img"),
    card.locator(".motion-legend"),
    card.getByRole("list", { name: "フォームの要点" }),
    panel.locator("p.muted"),
  ], "図8");
  await page.screenshot({ path: `${OUT}/motion.png` });
});
