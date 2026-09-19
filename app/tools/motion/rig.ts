// 関節付きの人体モデル(マネキン)。各種目の動作GIFを描画するためのツール用コード。
// 座標: Y上、体は+Zを向く、体の左が+X。角度は度。
import * as THREE from "three";

export type V3 = [number, number, number];
export type Frame = "world" | "root" | "rootW" | "torso";
export type Side = "L" | "R";

export interface FK {
  flex?: number; // 前方へ上げる(腕) / 前方へ上げる(脚)
  abd?: number; // 外へ開く
  twist?: number;
  bend?: number; // 肘・膝の曲げ
}
export interface IK {
  p: V3;
  frame?: Frame;
  pole?: V3; // 肘・膝が向く方向(同じ座標系)
}
export type Limb = { fk: FK } | { ik: IK };

export interface Pose {
  root?: { pos?: V3; rx?: number; ry?: number; rz?: number };
  torso?: { lean?: number; side?: number; twist?: number };
  head?: { nod?: number };
  armL?: Limb;
  armR?: Limb;
  legL?: Limb;
  legR?: Limb;
  footPitch?: number | [number, number];
  footYaw?: number;
  /** 手に持つダンベル(バーの向きを座標系で指定) */
  held?: { axis: V3; frame?: Frame; sides?: Side[] };
  /** 両手で1個のダンベルを持つ */
  heldTwo?: { axis: V3; frame?: Frame; offset?: V3 };
  bench?: { pos: V3; incline?: number; ry?: number } | null;
  pushBars?: V3[] | null;
}

const U = 0.3; // 上腕
const F = 0.27; // 前腕
const T = 0.42; // 大腿
const S = 0.42; // 下腿
const rad = THREE.MathUtils.degToRad;

const BODY = 0xf4f6f9;
const DARK = 0x2b2d33;

export const MUSCLE_REGIONS = [
  "pec", "upperpec", "delt_front", "delt_mid", "delt_rear", "lat", "trap", "biceps", "triceps",
  "quad", "hamstring", "glute", "core", "erector",
] as const;
export type Region = (typeof MUSCLE_REGIONS)[number];

interface LimbNodes {
  root: THREE.Group;
  mid: THREE.Group;
  end: THREE.Group;
}

export class Rig {
  scene = new THREE.Scene();
  root = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  arms = {} as Record<Side, LimbNodes>;
  legs = {} as Record<Side, LimbNodes>;
  muscles = {} as Record<Region, THREE.Mesh[]>;
  dumbbells: THREE.Group[] = [];
  bench = new THREE.Group();
  benchBack = new THREE.Group();
  pushBars = new THREE.Group();
  private bodyMat = new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.55, metalness: 0.0 });

  constructor() {
    for (const r of MUSCLE_REGIONS) this.muscles[r] = [];
    this.scene.add(this.root);
    this.buildBody();
    this.buildProps();
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material = this.bodyMat) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }

  private ellipsoid(parent: THREE.Object3D, pos: V3, radii: V3) {
    const m = this.mesh(new THREE.SphereGeometry(1, 24, 16));
    m.position.set(...pos);
    m.scale.set(...radii);
    parent.add(m);
    return m;
  }

  private overlay(region: Region, parent: THREE.Object3D, pos: V3, radii: V3) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xff6a1f, roughness: 0.5, emissive: 0xff6a1f, emissiveIntensity: 0.2 })
    );
    m.position.set(...pos);
    m.scale.set(...radii);
    m.visible = false;
    parent.add(m);
    this.muscles[region].push(m);
    return m;
  }

  private capsule(parent: THREE.Object3D, len: number, r: number) {
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 8, 16);
    g.translate(0, -len / 2, 0);
    const m = this.mesh(g);
    parent.add(m);
    return m;
  }

  private buildBody() {
    const { root, torso, head } = this;
    // 骨盤
    this.ellipsoid(root, [0, 0, 0], [0.17, 0.11, 0.11]);
    root.add(torso);
    // 胴体(腰・胸の2つの楕円体で逆三角形に)
    this.ellipsoid(torso, [0, 0.13, 0], [0.145, 0.17, 0.09]);
    this.ellipsoid(torso, [0, 0.4, 0], [0.2, 0.14, 0.105]);
    // 首・頭
    const neck = this.mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 12));
    neck.position.set(0, 0.55, 0);
    torso.add(neck);
    head.position.set(0, 0.64, 0.01);
    torso.add(head);
    const skull = this.ellipsoid(head, [0, 0.05, 0], [0.085, 0.1, 0.095]);
    skull.castShadow = true;
    const nose = this.mesh(new THREE.ConeGeometry(0.018, 0.04, 10));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.04, 0.105);
    head.add(nose);

    // 胴体の筋肉
    for (const s of [1, -1]) {
      this.overlay("pec", torso, [0.095 * s, 0.4, 0.088], [0.09, 0.07, 0.035]);
      this.overlay("upperpec", torso, [0.09 * s, 0.46, 0.078], [0.085, 0.045, 0.035]);
      this.overlay("lat", torso, [0.115 * s, 0.28, -0.075], [0.075, 0.15, 0.035]);
      this.overlay("erector", torso, [0.04 * s, 0.1, -0.085], [0.032, 0.13, 0.03]);
      this.overlay("glute", root, [0.08 * s, -0.035, -0.092], [0.075, 0.075, 0.05]);
    }
    this.overlay("core", torso, [0, 0.14, 0.09], [0.09, 0.14, 0.04]);
    this.overlay("trap", torso, [0, 0.49, -0.085], [0.11, 0.07, 0.03]);

    // 腕
    for (const side of ["L", "R"] as Side[]) {
      const s = side === "L" ? 1 : -1;
      const sh = new THREE.Group();
      sh.position.set(0.19 * s, 0.5, 0);
      torso.add(sh);
      this.ellipsoid(sh, [0, 0, 0], [0.065, 0.065, 0.065]);
      this.capsule(sh, U, 0.045);
      const el = new THREE.Group();
      el.position.set(0, -U, 0);
      sh.add(el);
      this.ellipsoid(el, [0, 0, 0], [0.042, 0.042, 0.042]);
      this.capsule(el, F, 0.036);
      const wr = new THREE.Group();
      wr.position.set(0, -F, 0);
      el.add(wr);
      this.ellipsoid(wr, [0, -0.04, 0], [0.038, 0.05, 0.03]);
      this.arms[side] = { root: sh, mid: el, end: wr };
      this.overlay("delt_front", sh, [0.0, -0.035, 0.05], [0.05, 0.065, 0.032]);
      this.overlay("delt_mid", sh, [0.05 * s, -0.03, 0.0], [0.032, 0.065, 0.05]);
      this.overlay("delt_rear", sh, [0.0, -0.035, -0.05], [0.05, 0.065, 0.032]);
      this.overlay("biceps", sh, [0, -0.15, 0.04], [0.04, 0.1, 0.034]);
      this.overlay("triceps", sh, [0, -0.15, -0.04], [0.04, 0.1, 0.034]);
    }

    // 脚
    for (const side of ["L", "R"] as Side[]) {
      const s = side === "L" ? 1 : -1;
      const hip = new THREE.Group();
      hip.position.set(0.09 * s, -0.02, 0);
      root.add(hip);
      this.capsule(hip, T, 0.075);
      const knee = new THREE.Group();
      knee.position.set(0, -T, 0);
      hip.add(knee);
      this.ellipsoid(knee, [0, 0, 0], [0.058, 0.058, 0.058]);
      this.capsule(knee, S, 0.055);
      const ankle = new THREE.Group();
      ankle.position.set(0, -S, 0);
      knee.add(ankle);
      const foot = this.mesh(new THREE.BoxGeometry(0.09, 0.07, 0.25));
      foot.position.set(0, -0.045, 0.07);
      ankle.add(foot);
      this.legs[side] = { root: hip, mid: knee, end: ankle };
      this.overlay("quad", hip, [0, -0.22, 0.056], [0.062, 0.17, 0.04]);
      this.overlay("hamstring", hip, [0, -0.22, -0.056], [0.062, 0.17, 0.04]);
    }
  }

  private buildProps() {
    const mat = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.5, metalness: 0.3 });
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 12), mat);
      handle.rotation.z = Math.PI / 2;
      g.add(handle);
      for (const x of [-0.09, 0.09]) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.045, 6), mat);
        plate.rotation.z = Math.PI / 2;
        plate.position.x = x;
        plate.castShadow = true;
        g.add(plate);
      }
      g.visible = false;
      this.scene.add(g);
      this.dumbbells.push(g);
    }
    // ベンチ(長手方向がZ)
    const pad = new THREE.MeshStandardMaterial({ color: 0x40444d, roughness: 0.7 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.4, metalness: 0.4 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.62), pad);
    seat.position.set(0, 0.405, 0.31);
    seat.castShadow = true;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.62), pad);
    back.position.set(0, 0, -0.31);
    back.castShadow = true;
    this.benchBack.position.set(0, 0.405, 0);
    this.benchBack.add(back);
    this.bench.add(seat, this.benchBack);
    for (const z of [-0.5, 0.5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.37, 0.04), frame);
      leg.position.set(0, 0.185, z);
      this.bench.add(leg);
    }
    this.bench.visible = false;
    this.scene.add(this.bench);
    // プッシュバー
    for (const x of [-0.22, 0.22]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 12), mat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(x, 0.1, 0);
      const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.03), mat);
      l1.position.set(x, 0.045, 0.07);
      const l2 = l1.clone();
      l2.position.z = -0.07;
      this.pushBars.add(bar, l1, l2);
    }
    this.pushBars.visible = false;
    this.scene.add(this.pushBars);
  }

  // ---------- 姿勢の適用 ----------
  private frameMatrix(frame: Frame): THREE.Matrix4 {
    this.scene.updateMatrixWorld(true);
    switch (frame) {
      case "world":
        return new THREE.Matrix4();
      case "root":
        return this.root.matrixWorld.clone();
      case "torso":
        return this.torso.matrixWorld.clone();
      case "rootW":
        return new THREE.Matrix4().makeTranslation(this.root.position.x, this.root.position.y, this.root.position.z);
    }
  }
  private toWorld(v: V3, frame: Frame = "world") {
    return new THREE.Vector3(...v).applyMatrix4(this.frameMatrix(frame));
  }
  /** 方向ベクトルを座標系からワールドへ回す(長さは保つ) */
  private dirToWorld(v: V3, frame: Frame = "world") {
    return new THREE.Vector3(...v).applyQuaternion(this.quatOf(frame));
  }
  private quatOf(frame: Frame) {
    const q = new THREE.Quaternion();
    this.frameMatrix(frame).decompose(new THREE.Vector3(), q, new THREE.Vector3());
    return q;
  }

  private worldPos(o: THREE.Object3D) {
    o.updateWorldMatrix(true, false);
    return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  }
  private worldQuat(o: THREE.Object3D) {
    o.updateWorldMatrix(true, false);
    return o.getWorldQuaternion(new THREE.Quaternion());
  }

  private applyFK(n: LimbNodes, fk: FK, side: Side, kind: "arm" | "leg") {
    const s = side === "L" ? 1 : -1;
    const flex = rad(fk.flex ?? 0);
    const abd = rad(fk.abd ?? 0) * s;
    const tw = rad(fk.twist ?? 0) * s;
    if (kind === "arm") {
      n.root.rotation.set(-flex, tw, abd, "XZY");
      n.mid.rotation.set(-rad(fk.bend ?? 0), 0, 0);
    } else {
      n.root.rotation.set(-flex, tw, abd, "XZY");
      n.mid.rotation.set(rad(fk.bend ?? 0), 0, 0);
    }
  }

  private applyIK(n: LimbNodes, ik: IK, l1: number, l2: number, defaultPole: V3) {
    const P = this.worldPos(n.root);
    const T3 = this.toWorld(ik.p, ik.frame);
    const pole = this.dirToWorld(ik.pole ?? defaultPole, ik.frame);
    const toT = T3.clone().sub(P);
    let d = toT.length();
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
    const u = toT.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const v = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
    if (v.lengthSq() < 1e-6) v.set(0, 0, 1).sub(u.clone().multiplyScalar(u.z));
    v.normalize();
    const E = P.clone().add(u.clone().multiplyScalar(a)).add(v.multiplyScalar(h));
    const endPoint = P.clone().add(u.clone().multiplyScalar(d));
    const down = new THREE.Vector3(0, -1, 0);
    const qRootW = new THREE.Quaternion().setFromUnitVectors(down, E.clone().sub(P).normalize());
    const parentQ = this.worldQuat(n.root.parent!);
    n.root.quaternion.copy(parentQ.clone().invert().multiply(qRootW));
    const qMidW = new THREE.Quaternion().setFromUnitVectors(down, endPoint.clone().sub(E).normalize());
    n.mid.quaternion.copy(qRootW.clone().invert().multiply(qMidW));
  }

  private applyLimb(n: LimbNodes, limb: Limb | undefined, side: Side, kind: "arm" | "leg") {
    n.root.quaternion.identity();
    n.mid.quaternion.identity();
    n.root.rotation.set(0, 0, 0);
    n.mid.rotation.set(0, 0, 0);
    if (!limb) {
      if (kind === "arm") this.applyFK(n, { abd: 7 }, side, "arm");
      return;
    }
    const s = side === "L" ? 1 : -1;
    if ("fk" in limb) this.applyFK(n, limb.fk, side, kind);
    else if (kind === "arm") this.applyIK(n, limb.ik, U, F, [0.25 * s, -1, -0.35]);
    else this.applyIK(n, limb.ik, T, S, [0.15 * s, 0, 1]);
    this.scene.updateMatrixWorld(true);
  }

  applyPose(p: Pose) {
    const { root, torso, head } = this;
    root.position.set(...(p.root?.pos ?? [0, 0.94, 0]));
    root.rotation.set(rad(p.root?.rx ?? 0), rad(p.root?.ry ?? 0), rad(p.root?.rz ?? 0));
    torso.rotation.set(rad(p.torso?.lean ?? 0), rad(p.torso?.twist ?? 0), rad(p.torso?.side ?? 0));
    head.rotation.set(rad(p.head?.nod ?? 0), 0, 0);
    this.scene.updateMatrixWorld(true);

    this.applyLimb(this.legs.L, p.legL, "L", "leg");
    this.applyLimb(this.legs.R, p.legR, "R", "leg");
    this.applyLimb(this.arms.L, p.armL, "L", "arm");
    this.applyLimb(this.arms.R, p.armR, "R", "arm");

    // 足の向き(地面に平ら、つま先立ちなど)
    for (const side of ["L", "R"] as Side[]) {
      const n = this.legs[side];
      const s = side === "L" ? 1 : -1;
      const fp = Array.isArray(p.footPitch) ? p.footPitch[side === "L" ? 0 : 1] : (p.footPitch ?? 0);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(fp), rad((p.footYaw ?? 8) * s), 0, "YXZ"));
      n.end.quaternion.copy(this.worldQuat(n.mid).invert().multiply(q));
    }
    this.scene.updateMatrixWorld(true);

    // ダンベル
    this.dumbbells.forEach((d) => (d.visible = false));
    if (p.held) {
      const sides = p.held.sides ?? ["L", "R"];
      sides.forEach((side, i) => {
        const wr = this.arms[side];
        const w = this.worldPos(wr.end);
        const el = this.worldPos(wr.mid);
        const dir = w.clone().sub(el).normalize();
        const c = w.clone().add(dir.multiplyScalar(0.05));
        const d = this.dumbbells[i];
        d.visible = true;
        d.position.copy(c);
        const axis = this.dirToWorld(p.held!.axis, p.held!.frame).normalize();
        d.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
      });
    }
    if (p.heldTwo) {
      const a = this.worldPos(this.arms.L.end);
      const b = this.worldPos(this.arms.R.end);
      const c = a.clone().add(b).multiplyScalar(0.5);
      if (p.heldTwo.offset) c.add(this.dirToWorld(p.heldTwo.offset, p.heldTwo.frame));
      const d = this.dumbbells[0];
      d.visible = true;
      d.position.copy(c);
      d.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.dirToWorld(p.heldTwo.axis, p.heldTwo.frame).normalize());
    }

    // ベンチ・プッシュバー
    this.bench.visible = !!p.bench;
    if (p.bench) {
      this.bench.position.set(...p.bench.pos);
      this.bench.rotation.y = rad(p.bench.ry ?? 0);
      const inc = rad(p.bench.incline ?? 0);
      this.benchBack.rotation.x = inc; // 背もたれを起こす(頭側=-Z が持ち上がる)
    }
    this.pushBars.visible = !!p.pushBars;
    if (p.pushBars) this.pushBars.position.set(...p.pushBars[0]);
  }

  /** 強調する筋肉領域を設定。primary=濃いオレンジ、secondary=黄。level=0..1で明るさ変化 */
  highlight(primary: Region[], secondary: Region[], level: number) {
    for (const r of MUSCLE_REGIONS) {
      const isP = primary.includes(r);
      const isS = !isP && secondary.includes(r);
      for (const m of this.muscles[r]) {
        m.visible = isP || isS;
        const mat = m.material as THREE.MeshStandardMaterial;
        const col = isP ? 0xff5a14 : 0xffb238;
        mat.color.setHex(col);
        mat.emissive.setHex(col);
        mat.emissiveIntensity = 0.12 + 0.4 * level;
      }
    }
  }

  worldPosOf(o: THREE.Object3D) {
    return this.worldPos(o);
  }
}
