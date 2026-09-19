// 動作GIFを生成する。使い方:
//   npm run motions                  … 全種目を public/motions/*.gif に書き出す
//   npm run motions -- --sheet id,id … 確認用の一覧画像(/tmp/motion-sheet.png)を作る
//   npm run motions -- --only id,id  … 指定した種目だけGIFを作る
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;
import pngjs from "pngjs";
const { PNG } = pngjs;
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const FRAMES = 32;
const DELAY = 66;
const W = 420;
const H = 560;

const server = await createServer({ root, logLevel: "error", server: { port: 5188, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto("http://localhost:5188/tools/motion/index.html");
await page.waitForFunction(() => window.__ids !== undefined);
const allIds = await page.evaluate(() => window.__ids);
const missing = await page.evaluate(() => window.__missing);
if (missing.length) console.warn("動作未定義の種目:", missing.join(", "));

async function frame(id, phase) {
  await page.evaluate(([i, p]) => window.__renderFrame(i, p), [id, phase]);
  return PNG.sync.read(await page.locator("#c").screenshot());
}

if (opt("--only-parts")) {
  // デバッグ: 部品名の正規表現に合うものだけ描く
  await page.evaluate((re) => window.__only(re), opt("--only-parts"));
}
if (args.includes("--bodymap")) {
  // 部位選択用の人体図: public/bodymap/{front,back}.png と、部位ごとの発光レイヤー {view}-{group}.png
  const GROUPS = JSON.parse(fs.readFileSync(path.join(root, "src/domain/bodyGroups.json"), "utf8"));
  const out = path.join(root, "public/bodymap");
  fs.mkdirSync(out, { recursive: true });
  await page.setViewportSize({ width: 420, height: 780 });
  const shot = async (view, regions) => {
    await page.evaluate(([v, r]) => window.__renderMap(v, r), [view, regions]);
    return PNG.sync.read(await page.locator("#c").screenshot());
  };
  for (const view of ["front", "back"]) {
    const base = await shot(view, []);
    fs.writeFileSync(path.join(out, `${view}.png`), PNG.sync.write(base));
    for (const g of GROUPS.filter((x) => x.views.includes(view))) {
      const lit = await shot(view, g.regions);
      const layer = new PNG({ width: base.width, height: base.height });
      let n = 0;
      for (let i = 0; i < lit.data.length; i += 4) {
        const diff = Math.abs(lit.data[i] - base.data[i]) + Math.abs(lit.data[i + 1] - base.data[i + 1]) + Math.abs(lit.data[i + 2] - base.data[i + 2]);
        if (diff > 40) { layer.data[i] = lit.data[i]; layer.data[i + 1] = lit.data[i + 1]; layer.data[i + 2] = lit.data[i + 2]; layer.data[i + 3] = 255; n++; }
      }
      fs.writeFileSync(path.join(out, `${view}-${g.id}.png`), PNG.sync.write(layer));
      console.log(view, g.id, n, "px");
    }
  }
} else if (opt("--sheet")) {
  const ids = opt("--sheet") === "all" ? allIds : opt("--sheet").split(",");
  const phases = [0, 0.5];
  const cols = 4;
  const cells = [];
  for (const id of ids) for (const ph of phases) cells.push(await frame(id, ph));
  const rows = Math.ceil(cells.length / cols);
  const sheet = new PNG({ width: W * cols, height: H * rows });
  cells.forEach((c, i) => PNG.bitblt(c, sheet, 0, 0, W, H, (i % cols) * W, Math.floor(i / cols) * H));
  fs.writeFileSync("/tmp/motion-sheet.png", PNG.sync.write(sheet));
  console.log("wrote /tmp/motion-sheet.png", ids.join(","));
} else {
  const ids = opt("--only") ? opt("--only").split(",") : allIds;
  const out = path.join(root, "public/motions");
  fs.mkdirSync(out, { recursive: true });
  for (const id of ids) {
    const frames = [];
    for (let i = 0; i < FRAMES; i++) frames.push((await frame(id, i / FRAMES)).data);
    // 全フレームから共通パレットを作る(ちらつき防止)
    const PER = 6000;
    const sample = new Uint8Array(frames.length * PER * 4);
    frames.forEach((f, fi) => {
      for (let j = 0; j < PER; j++) {
        const src = ((j * 37 + fi) % (W * H)) * 4;
        sample.set(f.subarray(src, src + 4), (fi * PER + j) * 4);
      }
    });
    const palette = quantize(sample, 256, { format: "rgb565" });
    const gif = GIFEncoder();
    frames.forEach((f, i) => {
      gif.writeFrame(applyPalette(f, palette, "rgb565"), W, H, { palette: i === 0 ? palette : undefined, delay: DELAY, repeat: 0 });
    });
    gif.finish();
    const file = path.join(out, `${id}.gif`);
    fs.writeFileSync(file, gif.bytes());
    console.log(id, `${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
  }
}
await browser.close();
await server.close();
