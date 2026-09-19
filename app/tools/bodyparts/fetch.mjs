// 使う部品のSTLを tools/bodyparts/cache/stl/ に取得する(初回のみ。git管理外)。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RAW, selectParts } from "./select.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(dir, "cache");
fs.mkdirSync(path.join(cache, "stl"), { recursive: true });

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}

const partsFile = path.join(cache, "parts_list_e.txt");
if (!fs.existsSync(partsFile)) fs.writeFileSync(partsFile, await (await get(`${RAW}/parts_list_e.txt`)).text());
const names = {};
for (const line of fs.readFileSync(partsFile, "utf8").split("\n").slice(1)) {
  const [id, n] = line.split("\t");
  if (id && n) names[id] = n.trim();
}
// 存在確認はGitHubのツリーAPIで一括取得
const treeFile = path.join(cache, "tree.json");
if (!fs.existsSync(treeFile)) {
  fs.writeFileSync(treeFile, await (await get("https://api.github.com/repos/Kevin-Mattheus-Moerman/BodyParts3D/git/trees/main?recursive=1")).text());
}
const tree = JSON.parse(fs.readFileSync(treeFile, "utf8")).tree;
const size = {};
for (const t of tree) {
  const m = /assets\/BodyParts3D_data\/stl\/(FMA\d+)\.stl$/.exec(t.path);
  if (m) size[m[1]] = t.size;
}
const parts = selectParts(names, new Set(Object.keys(size)));
fs.writeFileSync(path.join(cache, "selected.json"), JSON.stringify(parts.map((p) => ({ ...p, bytes: size[p.id] })), null, 1));
const total = parts.reduce((s, p) => s + size[p.id], 0);
console.log(`${parts.length}部品 (筋肉${parts.filter((p) => p.kind === "muscle").length}, 骨${parts.filter((p) => p.kind === "bone").length}) 合計${(total / 1e6).toFixed(0)}MB`);

let done = 0;
const queue = [...parts];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const p = queue.shift();
      const f = path.join(cache, "stl", `${p.id}.stl`);
      if (fs.existsSync(f) && fs.statSync(f).size === size[p.id]) { done++; continue; }
      fs.writeFileSync(f, Buffer.from(await (await get(`${RAW}/stl/${p.id}.stl`)).arrayBuffer()));
      if (++done % 40 === 0) console.log(`${done}/${parts.length}`);
    }
  })
);
console.log("完了");
