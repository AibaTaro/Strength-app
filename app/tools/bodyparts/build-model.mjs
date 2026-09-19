// BodyParts3Dの部品を、アニメーション用の軽量モデル(body.bin/body.json)に変換する。
//  - 座標系を リグ座標(X=体の左, Y=上, Z=前, 単位m, 足裏=0)へ変換
//  - 三角形を間引き(meshoptimizer)、各頂点に関節の重み(自動スキニング)を付ける
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MeshoptSimplifier } from "meshoptimizer";
import { readSTL } from "./stl.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(dir, "cache");
const parts = JSON.parse(fs.readFileSync(path.join(cache, "selected.json"), "utf8"));
await MeshoptSimplifier.ready;

const byName = (re) => parts.filter((p) => re.test(p.name));
const raw = new Map();
const load = (p) => {
  if (!raw.has(p.id)) raw.set(p.id, readSTL(path.join(cache, "stl", `${p.id}.stl`)));
  return raw.get(p.id);
};

// ---- 1) 骨から関節の位置を求める(モデル座標 mm: X=左, Y=後, Z=上) ----
function cap(name, end /* 'top'|'bottom' */, frac = 0.05) {
  const p = parts.find((q) => q.name === name);
  if (!p) throw new Error("部品なし: " + name);
  const pos = load(p).positions;
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 2; i < pos.length; i += 3) { zmin = Math.min(zmin, pos[i]); zmax = Math.max(zmax, pos[i]); }
  const lim = (zmax - zmin) * frac;
  const c = [0, 0, 0]; let n = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const z = pos[i + 2];
    if (end === "top" ? z >= zmax - lim : z <= zmin + lim) { c[0] += pos[i]; c[1] += pos[i + 1]; c[2] += pos[i + 2]; n++; }
  }
  return c.map((v) => v / n);
}
const mid = (a, b) => a.map((v, i) => (v + b[i]) / 2);
const A = {};
for (const [side, S] of [["L", "left"], ["R", "right"]]) {
  A["shoulder" + side] = cap(`${S} humerus`, "top", 0.06);
  A["elbow" + side] = mid(cap(`${S} humerus`, "bottom", 0.06), mid(cap(`${S} ulna`, "top", 0.05), cap(`${S} radius`, "top", 0.05)));
  A["wrist" + side] = mid(cap(`${S} radius`, "bottom", 0.05), cap(`${S} ulna`, "bottom", 0.05));
  A["hip" + side] = cap(`${S} femur`, "top", 0.05);
  A["knee" + side] = mid(cap(`${S} femur`, "bottom", 0.05), cap(`${S} tibia`, "top", 0.04));
  A["ankle" + side] = cap(`${S} tibia`, "bottom", 0.04);
}
A.hipsMid = mid(A.hipL, A.hipR);
A.neck = cap("seventh cervical vertebra", "top", 0.3);
A.headPivot = cap("atlas", "top", 0.4);
// 足裏の高さ・つま先・指先・頭頂
let floorZ = Infinity, toeY = Infinity, tipZ = Infinity, headTop = -Infinity;
for (const p of parts.filter((q) => q.kind === "bone")) {
  const pos = load(p).positions;
  const isFoot = /calcaneus|talus|metatarsal|cuboid|navicular|cuneiform|phalanx/.test(p.name) && false;
  for (let i = 0; i < pos.length; i += 3) {
    floorZ = Math.min(floorZ, pos[i + 2]);
    headTop = Math.max(headTop, pos[i + 2]);
  }
  void isFoot;
}
for (const p of byName(/metatarsal|distal phalanx/)) {
  const pos = load(p).positions;
  for (let i = 0; i < pos.length; i += 3) if (pos[i + 2] < 120) toeY = Math.min(toeY, pos[i + 1]); // 前=Y小
}
for (const p of byName(/metacarpal|phalanx/)) {
  const pos = load(p).positions;
  for (let i = 0; i < pos.length; i += 3) if (pos[i + 2] > 600) tipZ = Math.min(tipZ, pos[i + 2]);
}

// ---- 2) リグ座標への変換 ----
const legMM = Math.hypot(...A.hipL.map((v, i) => v - A.ankleL[i])); // 股関節-足首
const s = 0.84 / legMM; // 脚(大腿+下腿)を0.84mに合わせ、既存の動作定義と寸法を揃える
const hx = A.hipsMid[0], hy = A.hipsMid[1];
const toRig = (v) => [(v[0] - hx) * s, (v[2] - floorZ) * s, -(v[1] - hy) * s];
const anchors = {};
for (const [k, v] of Object.entries(A)) anchors[k] = toRig(v).map((x) => +x.toFixed(4));
anchors.toe = [0, 0.03, +(-(toeY - hy) * s).toFixed(4)];
anchors.headTop = [0, +((headTop - floorZ) * s).toFixed(4), anchors.headPivot[2]];
anchors.tip = { L: null, R: null };
const armLen = Math.hypot(...anchors.wristL.map((v, i) => v - anchors.elbowL[i]));
console.log("scale", s.toFixed(5), "height", ((headTop - floorZ) * s).toFixed(3), "legLen", 0.84, "upperArm", Math.hypot(...anchors.elbowL.map((v, i) => v - anchors.shoulderL[i])).toFixed(3), "forearm", armLen.toFixed(3), "hipsY", anchors.hipsMid[1], "ankleY", anchors.ankleL[1], "shoulderY", anchors.shoulderL[1], "neck", anchors.neck, "headPivot", anchors.headPivot);

// ---- 3) 関節(ボーン)の線分(リグ座標)。頂点→最寄り線分で重みを決める ----
const V = (a) => a;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const nrm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const sc = (a, k) => a.map((v) => v * k);
const handTip = (side) => add(anchors["wrist" + side], sc(nrm(sub(anchors["wrist" + side], anchors["elbow" + side])), 0.1));
const BONES = [
  { name: "pelvis", a: anchors.hipsMid, b: add(anchors.hipsMid, [0, -0.12, 0]) },
  { name: "torso", a: anchors.hipsMid, b: anchors.neck },
  { name: "head", a: anchors.neck, b: anchors.headTop },
  { name: "upperL", a: anchors.shoulderL, b: anchors.elbowL },
  { name: "foreL", a: anchors.elbowL, b: handTip("L") },
  { name: "upperR", a: anchors.shoulderR, b: anchors.elbowR },
  { name: "foreR", a: anchors.elbowR, b: handTip("R") },
  { name: "thighL", a: anchors.hipL, b: anchors.kneeL },
  { name: "shinL", a: anchors.kneeL, b: anchors.ankleL },
  { name: "thighR", a: anchors.hipR, b: anchors.kneeR },
  { name: "shinR", a: anchors.kneeR, b: anchors.ankleR },
  { name: "footL", a: anchors.ankleL, b: add(anchors.ankleL, [0, -0.05, 0.14]) },
  { name: "footR", a: anchors.ankleR, b: add(anchors.ankleR, [0, -0.05, 0.14]) },
];
function distSeg(p, a, b) {
  const ab = sub(b, a), ap = sub(p, a);
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1)));
  const c = add(a, sc(ab, t));
  return Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
}
const TAU = 0.03;
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
// ボーン番号: 0骨盤 1胴体 2頭 3右上腕(L) 4前腕L 5上腕R 6前腕R 7大腿L 8下腿L 9大腿R 10下腿R 11足L 12足R
const LIMB = { L: { upper: 3, fore: 4, thigh: 7, shin: 8, foot: 11 }, R: { upper: 5, fore: 6, thigh: 9, shin: 10, foot: 12 } };
/** 部品ごとに、動きに追従してよいボーンを制限する(体側の筋肉が腕に引きずられる等を防ぐ) */
function rulesFor(p) {
  const n = p.name.toLowerCase();
  const side = /right/.test(n) ? "R" : /left/.test(n) ? "L" : null;
  const L = side ? LIMB[side] : null;
  const limbs = L ? Object.values(L) : [];
  let allowed = [0, 1, 2, ...limbs];
  let ramp = null;
  const has = (re) => re.test(n);
  if (p.kind === "bone") {
    if (has(/rib|sternum|manubrium|xiphoid|thoracic vertebra|lumbar vertebra|clavicle|scapula|first thoracic|tenth thoracic/) || has(/thoracic|lumbar/)) allowed = [1];
    else if (has(/cervical vertebra|atlas|axis/)) allowed = [1, 2];
    else if (has(/hip bone|sacrum|coccyx/)) allowed = has(/hip bone/) ? [0] : [0, 1];
    else if (has(/mandible|skull|cranial|frontal|parietal|occipital|temporal|sphenoid|ethmoid|zygomatic|maxilla|nasal|lacrimal|palatine/)) allowed = [2];
    else allowed = [0, 1, ...limbs]; // 四肢の骨
    return { allowed, ramp };
  }
  switch (p.group) {
    case "core": case "erector": allowed = [0, 1]; break;
    case "lat": allowed = [0, 1, ...(L ? [L.upper] : [])]; ramp = "lat"; break;
    case "pec": case "upperpec": allowed = [1, ...(L ? [L.upper] : [])]; ramp = "pec"; break;
    case "trap": allowed = [1, 2]; break;
    case "delt_front": case "delt_mid": case "delt_rear": allowed = [1, ...(L ? [L.upper] : [])]; break;
    case "biceps": case "triceps": allowed = [1, ...(L ? [L.upper, L.fore] : [])]; break;
    case "glute": allowed = [0, ...(L ? [L.thigh] : [])]; break;
    case "quad": case "hamstring": allowed = [0, ...(L ? [L.thigh, L.shin] : [])]; break;
    default:
      if (has(/serratus|rhomboid|pectoralis minor|levator/)) allowed = [1];
      else if (has(/sternocleidomastoid|splenius|temporalis|masseter/)) allowed = [1, 2];
      else if (has(/infraspinatus|teres|coracobrachialis/)) allowed = [1, ...(L ? [L.upper] : [])];
      else if (has(/digitorum (longus|brevis)|hallucis|accessorius/)) allowed = L ? [L.thigh, L.shin, L.foot] : [0];
      else if (has(/brachialis|brachioradialis|pronator|flexor carpi|palmaris|extensor|anconeus|supinator/)) allowed = L ? [L.upper, L.fore] : [1];
      else if (has(/tensor fasciae|sartorius|gracilis|adductor|pectineus/)) allowed = [0, ...(L ? [L.thigh, L.shin] : [])];
      else if (has(/gastrocnemius|soleus|tibialis|fibularis/)) allowed = L ? [L.thigh, L.shin, L.foot] : [0];
  }
  return { allowed, ramp };
}
function weights(p, rules) {
  const d = rules.allowed.map((i) => [distSeg(p, BONES[i].a, BONES[i].b), i]).sort((x, y) => x[0] - y[0]).slice(0, 4);
  let w = d.map(([di]) => Math.exp(-(di - d[0][0]) / TAU));
  if (rules.ramp) {
    const armIdx = new Set([3, 5]);
    const t = rules.ramp === "lat" ? smooth((p[1] - (anchors.shoulderL[1] - 0.25)) / 0.12) : smooth((Math.abs(p[0]) - 0.1) / 0.06);
    // 腕に追従するのは、上腕の近く(約10cm以内)の頂点だけ
    w = w.map((x, k) => (armIdx.has(d[k][1]) ? x * t * smooth(((rules.ramp === "lat" ? 0.08 : 0.11) - d[k][0]) / 0.04) : x));
    if (w.every((x) => x === 0)) w = d.map(([, i]) => (i === 1 ? 1 : 0));
  }
  const sum = w.reduce((x, y) => x + y, 0) || 1;
  return d.map(([, i], k) => [i, w[k] / sum]);
}

// ---- 4) 間引き・書き出し ----
const bins = [];
const meta = [];
let vOff = 0, iOff = 0;
let totalTris = 0;
for (const p of parts) {
  const m = load(p);
  const tris = m.indices.length / 3;
  const budget = Math.max(p.kind === "bone" ? 200 : 500, Math.min(p.kind === "bone" ? 3500 : 9000, Math.round(tris * (p.kind === "bone" ? 0.1 : 0.12))));
  let idx = m.indices;
  if (tris > budget) {
    const [simp] = MeshoptSimplifier.simplify(m.indices, m.positions, 3, budget * 3, 0.02);
    idx = simp;
  }
  const rules = rulesFor(p);
  // 使う頂点だけに詰め直す
  const remap = new Map();
  const pos = [];
  const newIdx = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    let r = remap.get(idx[i]);
    if (r === undefined) {
      r = pos.length / 3;
      remap.set(idx[i], r);
      const v = toRig([m.positions[idx[i] * 3], m.positions[idx[i] * 3 + 1], m.positions[idx[i] * 3 + 2]]);
      pos.push(...v);
    }
    newIdx[i] = r;
  }
  // 面の向き: 座標変換は回転のみなので反転不要
  const vc = pos.length / 3;
  const skinIdx = new Uint8Array(vc * 4);
  const skinW = new Float32Array(vc * 4);
  for (let v = 0; v < vc; v++) {
    const w = weights([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], rules);
    for (let k = 0; k < 4; k++) {
      skinIdx[v * 4 + k] = w[k] ? w[k][0] : 0;
      skinW[v * 4 + k] = w[k] ? w[k][1] : 0;
    }
  }
  bins.push({ pos: new Float32Array(pos), idx: newIdx, skinIdx, skinW });
  meta.push({ id: p.id, name: p.name, kind: p.kind, group: p.group, vOff, vCount: vc, iOff, iCount: newIdx.length });
  vOff += vc;
  iOff += newIdx.length;
  totalTris += newIdx.length / 3;
}
const totalV = vOff, totalI = iOff;
const P = new Float32Array(totalV * 3), SI = new Uint8Array(totalV * 4), SW = new Float32Array(totalV * 4), I = new Uint32Array(totalI);
bins.forEach((b, k) => {
  P.set(b.pos, meta[k].vOff * 3);
  SI.set(b.skinIdx, meta[k].vOff * 4);
  SW.set(b.skinW, meta[k].vOff * 4);
  I.set(b.idx, meta[k].iOff);
});
const out = Buffer.concat([Buffer.from(P.buffer), Buffer.from(SW.buffer), Buffer.from(SI.buffer), Buffer.from(I.buffer)]);
fs.writeFileSync(path.join(cache, "body.bin"), out);
fs.writeFileSync(
  path.join(cache, "body.json"),
  JSON.stringify({ totalV, totalI, anchors, bones: BONES.map((b) => ({ name: b.name, a: b.a, b: b.b })), parts: meta })
);
console.log(`parts ${meta.length}, triangles ${totalTris}, vertices ${totalV}, ${(out.length / 1e6).toFixed(1)}MB`);
