import fs from "node:fs";
/** バイナリSTLを読み、重複頂点を統合して {positions, indices} を返す */
export function readSTL(file, weld = 1e-3) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt32LE(80);
  const map = new Map();
  const positions = [];
  const indices = new Uint32Array(n * 3);
  let o = 84;
  for (let t = 0; t < n; t++) {
    o += 12;
    for (let v = 0; v < 3; v++) {
      const x = buf.readFloatLE(o), y = buf.readFloatLE(o + 4), z = buf.readFloatLE(o + 8);
      o += 12;
      const key = `${Math.round(x / weld)},${Math.round(y / weld)},${Math.round(z / weld)}`;
      let idx = map.get(key);
      if (idx === undefined) { idx = positions.length / 3; map.set(key, idx); positions.push(x, y, z); }
      indices[t * 3 + v] = idx;
    }
    o += 2;
  }
  return { positions: new Float32Array(positions), indices };
}
export function bbox(p) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], p[i + k]); b[k + 3] = Math.max(b[k + 3], p[i + k]); }
  return b;
}
