// 種目ごとの動作定義。pose(k): k=0(開始)→1(最大)の進行度から姿勢を返す。
// 角度は度、座標はメートル(体は+Zを向き、体の左が+X)。寸法はモデルの実測値(Dims)から計算する。
import type { Dims, Frame, Pose, V3 } from "./rig";

export interface Cam {
  az: number; // 0=正面, 90=体の左側, 180=背面
  el?: number;
  dist?: number;
  target?: V3;
}
export interface Motion {
  pose: (k: number) => Pose;
  cam: Cam;
  /** 筋肉の明るさ(0..1)。省略時は進行度k */
  effort?: (k: number) => number;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const mx = (v: V3): V3 => [-v[0], v[1], v[2]];
const rad = (d: number) => (d * Math.PI) / 180;

function armsIK(pL: V3, frame: Frame, pole?: V3): Pick<Pose, "armL" | "armR"> {
  return {
    armL: { ik: { p: pL, frame, pole } },
    armR: { ik: { p: mx(pL), frame, pole: pole && mx(pole) } },
  };
}
function feetIK(pL: V3, pole: V3 = [0.4, 0.2, 1]): Pick<Pose, "legL" | "legR"> {
  return { legL: { ik: { p: pL, pole } }, legR: { ik: { p: mx(pL), pole: mx(pole) } } };
}

const X: V3 = [1, 0, 0];
const Z: V3 = [0, 0, 1];

export function buildMotions(d: Dims): Record<string, Motion> {
  const { hipY, shY, shX, U, F, T, S, ankleY } = d;
  const R = U + F; // 腕の届く長さ
  const ANK = ankleY + 0.012; // 足首の高さ(足裏が床に付く)
  const BACK = 0.125; // 仰向けのとき、背中の厚み(床/ベンチ面から骨盤・肩までの高さ)
  const BENCH = 0.44;

  /** 足を地面に固定し、体の傾きから骨盤位置・傾きを求める(腕立て・プランク) */
  const bodyLine = (angleDeg: number, ankleH = 0.11) => {
    const a = rad(angleDeg);
    return { pos: [0, ankleH + (T + S) * Math.sin(a) + 0.02, (T + S) * Math.cos(a)] as V3, rx: 90 - angleDeg };
  };
  /** 仰向けの体: 肩の位置と骨盤の高さから骨盤位置・傾きを求める */
  const supine = (shoulder: V3, pelvisY: number) => {
    const phi = Math.asin(Math.max(-1, Math.min(1, (shoulder[1] - pelvisY) / shY)));
    return { pos: [0, pelvisY, shoulder[2] + shY * Math.cos(phi)] as V3, rx: -(90 - (phi * 180) / Math.PI) };
  };

  return {
    "dumbbell-curl": {
      cam: { az: 28 },
      pose: (k) => ({
        armL: { fk: { flex: lerp(0, 6, k), abd: 8, bend: lerp(4, 135, k) } },
        armR: { fk: { flex: lerp(0, 6, k), abd: 8, bend: lerp(4, 135, k) } },
        held: { axis: X, frame: "torso" },
      }),
    },
    "dumbbell-lateral-raise": {
      cam: { az: 20, dist: 5.6 },
      pose: (k) => ({
        armL: { fk: { flex: 8, abd: lerp(8, 88, k), bend: 14 } },
        armR: { fk: { flex: 8, abd: lerp(8, 88, k), bend: 14 } },
        held: { axis: Z, frame: "torso" },
      }),
    },
    "dumbbell-front-raise": {
      cam: { az: 50 },
      pose: (k) => ({
        armL: { fk: { flex: lerp(0, 88, k), abd: 6, bend: 10 } },
        armR: { fk: { flex: lerp(0, 88, k), abd: 6, bend: 10 } },
        held: { axis: X, frame: "torso" },
      }),
    },
    "dumbbell-shoulder-press": {
      cam: { az: 25, dist: 5.6, target: [0, 1.1, 0] },
      pose: (k) => ({
        ...armsIK(lerp3([shX + 0.12, shY + 0.06, 0.06], [shX - 0.01, shY + R - 0.03, 0.0], k), "torso", [0.7, -0.5, -0.1]),
        held: { axis: X, frame: "torso" },
      }),
    },
    "dumbbell-triceps-extension": {
      cam: { az: 75, dist: 5.6, target: [0, 1.15, 0] },
      effort: (k) => 1 - k,
      pose: (k) => ({
        ...armsIK(lerp3([0.05, shY + R - 0.03, 0.03], [0.05, shY + 0.12, -0.12], k), "torso", [0.1, 1, 0.1]),
        heldTwo: { axis: [0, 1, 0], frame: "torso", offset: [0, 0.05, 0] },
      }),
    },
    "goblet-squat": {
      cam: { az: 38 },
      pose: (k) => ({
        root: { pos: [0, lerp(hipY, 0.55, k), lerp(0, -0.2, k)] },
        torso: { lean: lerp(0, 30, k) },
        head: { nod: -lerp(0, 22, k) },
        ...feetIK([0.2, ANK, 0.02], [0.6, 0, 1]),
        footYaw: 14,
        ...armsIK([0.07, shY - 0.09, 0.25], "torso", [0.3, -1, 0.2]),
        heldTwo: { axis: [0, 1, 0], frame: "torso", offset: [0, -0.04, 0.02] },
      }),
    },
    "bodyweight-squat": {
      cam: { az: 72 },
      pose: (k) => ({
        root: { pos: [0, lerp(hipY, 0.55, k), lerp(0, -0.2, k)] },
        torso: { lean: lerp(0, 30, k) },
        head: { nod: -lerp(0, 22, k) },
        ...feetIK([0.2, ANK, 0.02], [0.6, 0, 1]),
        footYaw: 14,
        ...armsIK([0.13, shY - 0.05, 0.5], "torso", [0.3, -1, 0.2]),
      }),
    },
    "dumbbell-lunge": {
      cam: { az: 68, dist: 5.2 },
      pose: (k) => ({
        root: { pos: [0, lerp(hipY, 0.62, k), lerp(0, 0.03, k)] },
        torso: { lean: lerp(0, 4, k) },
        legL: { ik: { p: lerp3([0.1, ANK, 0], [0.1, ANK, 0.52], k), pole: [0.2, 0.1, 1] } },
        legR: { ik: { p: lerp3([-0.1, ANK, 0], [-0.1, ANK + 0.06, -0.5], k), pole: [-0.1, -1, -0.4] } },
        footPitch: [0, lerp(0, 62, k)],
        footYaw: 4,
        ...armsIK([shX + 0.09, shY - R + 0.01, 0.0], "torso", [0.3, -1, -0.3]),
        held: { axis: Z, frame: "torso" },
      }),
    },
    "dumbbell-romanian-deadlift": {
      cam: { az: 128, el: 10 },
      pose: (k) => {
        const lean = lerp(0, 76, k);
        const ys = shY * Math.cos(rad(lean));
        const zs = shY * Math.sin(rad(lean));
        return {
          root: { pos: [0, lerp(hipY, hipY - 0.06, k), lerp(0, -0.3, k)] },
          torso: { lean },
          head: { nod: -lean * 0.7 },
          ...feetIK([0.16, ANK, 0.0], [0.2, 0.1, 1]),
          footYaw: 6,
          ...armsIK([0.22, ys - (R - 0.02), zs + 0.05 * (1 - k)], "rootW", [0.3, -1, 0.3]),
          held: { axis: X, frame: "world" },
        };
      },
    },
    "dumbbell-bent-over-row": {
      cam: { az: 150, el: 10, target: [0, 0.95, 0.1] },
      pose: (k) => ({
        root: { pos: [0, 0.87, -0.22] },
        torso: { lean: 68 },
        head: { nod: -48 },
        ...feetIK([0.18, ANK, 0.02], [0.1, 0.1, 1]),
        footYaw: 6,
        ...armsIK(lerp3([shX, shY * Math.cos(rad(68)) - (R - 0.02), shY * Math.sin(rad(68)) + 0.02], [shX + 0.07, 0.14, 0.12], k), "rootW", [0.3, 0.6, -1]),
        held: { axis: X, frame: "world" },
      }),
    },
    "dumbbell-one-arm-row": {
      cam: { az: 200, el: 10, dist: 5.4, target: [0, 0.8, 0.15] },
      pose: (k) => ({
        root: { pos: [0, 0.921, 0] },
        torso: { lean: 80 },
        head: { nod: -55 },
        bench: { pos: [d.hipY > 0 ? 0.0883 : 0.09, -0.04, 0.2] },
        legL: { fk: { flex: 0, bend: 90 } },
        legR: { ik: { p: [-0.22, ANK, 0.06], pole: [0, 0, 1] } },
        footPitch: [0, 0],
        armL: { ik: { p: [shX, 0.43, shY * Math.sin(rad(80))], pole: [0.3, -1, 0] } },
        armR: { ik: { p: lerp3([-shX, 0.46, shY * Math.sin(rad(80))], [-shX - 0.06, 0.95, 0.2], k), pole: lerp3([-0.2, -1, 0], [-0.2, 0.4, -1], k) } },
        held: { axis: Z, frame: "world", sides: ["R"] },
      }),
    },
    "dumbbell-bench-press": {
      cam: { az: 25, el: 38, dist: 4.5, target: [0, 0.5, -0.1] },
      pose: (k) => {
        const r = supine([shX, BENCH + BACK, -shY], BENCH + BACK);
        return {
          root: { pos: r.pos, rx: r.rx },
          bench: { pos: [0, 0, -0.5] },
          ...feetIK([0.2, ANK, 0.5], [0.3, 1, 0.4]),
          footYaw: 6,
          ...armsIK(lerp3([0.4, BENCH + BACK + 0.16, -shY], [shX + 0.01, BENCH + BACK + R - 0.03, -shY], k), "world", [1, -0.8, 0]),
          held: { axis: X, frame: "world" },
        };
      },
    },
    "dumbbell-incline-bench-press": {
      cam: { az: 40, el: 20, dist: 4.6, target: [0, 0.6, -0.1] },
      pose: (k) => {
        const inc = 35;
        const n: V3 = [0, Math.cos(rad(inc)), Math.sin(rad(inc))];
        const pel: V3 = [0, 0.55, 0.03];
        const Sh: V3 = [shX, pel[1] + shY * Math.sin(rad(inc)), pel[2] - shY * Math.cos(rad(inc))];
        const at = (dd: number, x: number): V3 => [x, Sh[1] + n[1] * dd, Sh[2] + n[2] * dd];
        return {
          root: { pos: pel, rx: -(90 - inc) },
          bench: { pos: [0, 0, 0], incline: inc },
          ...feetIK([0.2, ANK, 0.5], [0.3, 1, 0.4]),
          footYaw: 6,
          ...armsIK(lerp3(at(0.14, 0.4), at(R - 0.02, shX), k), "world", [1, -0.8, 0]),
          held: { axis: X, frame: "world" },
        };
      },
    },
    "dumbbell-floor-press": {
      cam: { az: 25, el: 38, dist: 4.5, target: [0, 0.3, -0.1] },
      pose: (k) => {
        const r = supine([shX, BACK, -shY], BACK);
        return {
          root: { pos: r.pos, rx: r.rx },
          ...feetIK([0.2, ANK, 0.45], [0.3, 1, 0.4]),
          footYaw: 6,
          ...armsIK(lerp3([0.44, BACK + 0.24, -shY], [shX + 0.02, BACK + R - 0.02, -shY], k), "world", [1, -0.8, 0]),
          held: { axis: X, frame: "world" },
        };
      },
    },
    "dumbbell-hip-thrust": {
      cam: { az: 90, el: 6, dist: 4.4, target: [0, 0.45, 0.1] },
      pose: (k) => {
        const r = supine([shX, BENCH + 0.11, -0.32], lerp(0.22, 0.62, k));
        return {
          root: { pos: r.pos, rx: r.rx },
          bench: { pos: [0, 0, -0.32], ry: 90 },
          ...feetIK([0.2, ANK, 0.42], [0.2, 1, 0.7]),
          footYaw: 6,
          ...armsIK([0.13, 0.1, 0.16], "root", [0.4, 0.2, 0.5]),
          heldTwo: { axis: X, frame: "world" },
        };
      },
    },
    "bodyweight-hip-lift": {
      cam: { az: 90, el: 6, dist: 4.4, target: [0, 0.3, 0.05] },
      pose: (k) => {
        const r = supine([shX, BACK, -0.35], lerp(BACK, 0.47, k));
        return {
          root: { pos: r.pos, rx: r.rx },
          ...feetIK([0.2, ANK, 0.42], [0.2, 1, 0.7]),
          footYaw: 6,
          ...armsIK([0.27, 0.05, 0.1], "world", [0.5, -1, 0]),
        };
      },
    },
    "pushup-with-bar": {
      cam: { az: 55, el: 12, dist: 5.2, target: [0, 0.45, 0.62] },
      pose: (k) => {
        const b = bodyLine(lerp(26, 7, k));
        return {
          root: { pos: b.pos, rx: b.rx },
          head: { nod: 20 },
          pushBars: [[0, 0, 1.3]],
          ...feetIK([0.09, 0.11, 0], [0, 1, 0]),
          footPitch: 78,
          footYaw: 0,
          ...armsIK([0.22, 0.19, 1.3], "world", [0.6, -0.3, -1]),
        };
      },
    },
    plank: {
      cam: { az: 70, el: -3, dist: 5.5, target: [0, 0.32, 0.8] },
      pose: (k) => {
        const b = bodyLine(9);
        const bob = 0.006 * Math.sin(k * Math.PI);
        return {
          root: { pos: [b.pos[0], b.pos[1] + bob, b.pos[2]], rx: b.rx },
          head: { nod: 20 },
          ...feetIK([0.09, 0.11, 0], [0, 1, 0]),
          footPitch: 78,
          footYaw: 0,
          ...armsIK([0.19, 0.07, 1.62], "world", [0.2, -0.6, -1]),
        };
      },
      effort: (k) => 0.4 + 0.6 * Math.sin(k * Math.PI),
    },
  };
}
