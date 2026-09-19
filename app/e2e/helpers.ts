import { expect, type Locator, type Page } from "@playwright/test";

export const STORAGE_KEY = "strength-app-data-v1";

export async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

export async function goTo(page: Page, tab: "今日" | "運動中" | "振り返り" | "設定") {
  const nav = page.getByRole("navigation", { name: "メインメニュー" });
  await nav.getByRole("button", { name: tab === "運動中" ? /運動中/ : tab }).click();
}

export function card(page: Page, name: string): Locator {
  return page.getByRole("region", { name });
}

export async function buildProposal(page: Page) {
  await page.getByRole("button", { name: "今日の候補を作る" }).click();
  await expect(page.getByRole("button", { name: /この内容で開始/ })).toBeVisible();
}

export async function startWorkout(page: Page) {
  await buildProposal(page);
  await page.getByRole("button", { name: /この内容で開始/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "運動中" })).toBeVisible();
}

export const completeButton = (page: Page) => page.getByRole("button", { name: /セット\d+を完了/ });

/** localStorageのアプリデータを読み、加工して書き戻し、再読込する(履歴データの投入用) */
export async function mutateData(page: Page, fn: string) {
  await page.evaluate(
    ([key, body]) => {
      const data = JSON.parse(localStorage.getItem(key) ?? "null");
      new Function("data", body)(data);
      localStorage.setItem(key, JSON.stringify(data));
    },
    [STORAGE_KEY, fn] as const
  );
  await page.reload();
}

/** 過去のセッション履歴(同一種目・同一条件を2回分)を投入するためのスクリプト断片 */
export function seedTwoSessions(exerciseId: string, weightKg: number, pieceCount: 1 | 2, reps: number, sets = 3) {
  return `
    const now = Date.now();
    ['past-a', 'past-b'].forEach((sid, si) => {
      for (let i = 0; i < ${sets}; i++) {
        data.setRecords.push({
          id: sid + '-' + i, sessionId: sid, exerciseId: '${exerciseId}', order: i,
          side: ${pieceCount === 2 ? "'both'" : "'na'"}, weightKg: ${weightKg}, pieceCount: ${pieceCount}, reps: ${reps},
          effort: '2', pain: false, isWarmup: false,
          completedAt: new Date(now - (si + 1) * 3 * 86400000 + i * 60000).toISOString(), updatedVersion: 1,
        });
      }
    });
  `;
}

/** セットを完了する。二重タップ防止(350ms)を意図せず踏まないよう、完了後に少し待つ。 */
export async function completeSet(page: Page) {
  await completeButton(page).click();
  await page.waitForTimeout(400);
}
