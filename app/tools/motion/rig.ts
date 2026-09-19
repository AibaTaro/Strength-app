// 解剖学モデル(BodyParts3D, CC BY-SA 2.1 JP)を関節に取り付けて動かすリグ。
// 座標: Y上、体は+Zを向き、体の左が+X。角度は度。単位はメートル。
import * as THREE from "three";

export type V3 = [number, number, number];
export type Frame = "world" | "root" | "rootW" | "torso";
export type Side = "L" | "R";

export interface FK {
  flex?: number;
  abd?: number;
  twist?: number;
  bend?: number;
}
export interface IK {
  p: V3;
  frame?: Frame;
  pole?: V3;
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
  held?: { axis: V3; frame?: Frame; sides?: Side[] };
  heldTwo?: { axis: V3; frame?: Frame; offset?: V3 };
  bench?: { pos: V3; incline?: number; ry?: number } | null;
  pushBars?: V3[] | null;
}

export const MUSCLE_REGIONS = [
  "pec", "upperpec", "delt_front", "delt_mid", "delt_rear", "lat", "trap", "biceps", "triceps",
  "quad", "hamstring", "glute", "core", "erector",
] as const;
export type Region = (typeof MUSCLE_REGIONS)[number];

interface PartMeta {
  id: string;
  name: string;
  kind: "muscle" | "bone";
  group: string;
  vOff: number;
  vCount: number;
  iOff: number;
  iCount: number;
}
interface ModelJSON {
  totalV: number;
  totalI: number;
  anchors: Record<string, V3>;
  bones: { name: string; a: V3; b: V3 }[];
  parts: PartMeta[];
}

export interface Dims {
  hipY: number;
  shY: number; // 骨盤中心から肩までの高さ
  shX: number;
  U: number;
  F: number;
  T: number;
  S: number;
  ankleY: number;
}

const rad = THREE.MathUtils.degToRad;
const MUSCLE_NEUTRAL = 0xdfe1e6;
const BONE_COLOR = 0xb9b3a4;
const DARK = 0x2b2d33;

interface LimbNodes {
  root: THREE.Bone;
  mid: THREE.Bone;
  end: THREE.Object3D;
}

export class Rig {
  scene = new THREE.Scene();
  root = new THREE.Bone();
  torso = new THREE.Bone();
  head = new THREE.Bone();
  arms = {} as Record<Side, LimbNodes>;
  legs = {} as Record<Side, LimbNodes>;
  dims!: Dims;
  dumbbells: THREE.Group[] = [];
  meshes: { mesh: THREE.SkinnedMesh; name: string; kind: string; group: string }[] = [];
  bench = new THREE.Group();
  benchBack = new THREE.Group();
  pushBars = new THREE.Group();
  private groups = new Map<string, THREE.MeshStandardMaterial>();
  private boneMat = new THREE.MeshStandardMaterial({ color: BONE_COLOR, roughness: 0.7 });

  static async load(jsonUrl: string, binUrl: string) {
    const [meta, bin] = await Promise.all([fetch(jsonUrl).then((r) => r.json() as Promise<ModelJSON>), fetch(binUrl).then((r) => r.arrayBuffer())]);
    const rig = new Rig();
    rig.build(meta, bin);
    rig.buildProps();
    return rig;
  }

  private mat(group: string) {
    let m = this.groups.get(group);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: MUSCLE_NEUTRAL, roughness: 0.55, metalness: 0 });
      this.groups.set(group, m);
    }
    return m;
  }

  private build(meta: ModelJSON, bin: ArrayBuffer) {
    const a = meta.anchors;
    const v3 = (v: V3) => new THREE.Vector3(...v);
    const hips = v3(a.hipsMid);
    const len = (p: V3, q: V3) => v3(p).distanceTo(v3(q));
    const U = len(a.shoulderL, a.elbowL);
    const F = len(a.elbowL, a.wristL);
    const T = len(a.hipL, a.kneeL);
    const S = len(a.kneeL, a.ankleL);
    this.dims = { hipY: a.hipsMid[1], shY: a.shoulderL[1] - a.hipsMid[1], shX: a.shoulderL[0], U, F, T, S, ankleY: a.ankleL[1] };

    // ---- 関節の階層(ゼロ姿勢=手足がまっすぐ下) ----
    const { root, torso, head } = this;
    root.position.copy(hips);
    root.add(torso);
    head.position.copy(v3(a.headPivot).sub(hips));
    torso.add(head);
    const mk = (parent: THREE.Object3D, pos: THREE.Vector3) => {
      const b = new THREE.Bone();
      b.position.copy(pos);
      parent.add(b);
      return b;
    };
    for (const side of ["L", "R"] as Side[]) {
      const sh = mk(torso, v3(a["shoulder" + side]).sub(hips));
      const el = mk(sh, new THREE.Vector3(0, -U, 0));
      const wr = new THREE.Object3D();
      wr.position.set(0, -F, 0);
      el.add(wr);
      this.arms[side] = { root: sh, mid: el, end: wr };
      const hip = mk(root, v3(a["hip" + side]).sub(hips));
      const knee = mk(hip, new THREE.Vector3(0, -T, 0));
      const ankle = mk(knee, new THREE.Vector3(0, -S, 0));
      this.legs[side] = { root: hip, mid: knee, end: ankle };
    }
    // 頭: 顔面は鍛える対象ではないため、頭蓋骨や筋肉は出さず、なめらかな頭にする
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9ccd6, roughness: 0.6 });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), skin);
    skull.scale.set(0.083, 0.098, 0.095);
    skull.position.set(0, 0.078, 0.012);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), skin);
    jaw.scale.set(0.058, 0.06, 0.07);
    jaw.position.set(0, 0.03, 0.03);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, 12), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.06, 0.1);
    for (const m of [skull, jaw, nose]) {
      m.castShadow = true;
      head.add(m);
    }
    this.scene.add(root);
    const bones: THREE.Bone[] = [
      root, torso, head,
      this.arms.L.root, this.arms.L.mid as THREE.Bone, this.arms.R.root, this.arms.R.mid as THREE.Bone,
      this.legs.L.root, this.legs.L.mid, this.legs.R.root, this.legs.R.mid, this.legs.L.end as THREE.Bone, this.legs.R.end as THREE.Bone,
    ];

    // ---- 各ボーンの「元の姿勢」(モデル座標)の逆行列 ----
    const dirQuat = (from: V3, to: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(v3(from), to.clone().normalize());
    const frame = (origin: V3, q: THREE.Quaternion) => new THREE.Matrix4().compose(v3(origin), q, new THREE.Vector3(1, 1, 1)).invert();
    const B = meta.bones;
    const down: V3 = [0, -1, 0];
    const up: V3 = [0, 1, 0];
    const I = new THREE.Quaternion();
    const seg = (i: number) => v3(B[i].b).sub(v3(B[i].a));
    const inv: THREE.Matrix4[] = [
      frame(a.hipsMid, I), // pelvis
      frame(a.hipsMid, dirQuat(up, seg(1))), // torso
      frame(a.headPivot, dirQuat(up, seg(2))), // head
      frame(a.shoulderL, dirQuat(down, seg(3))),
      frame(a.elbowL, dirQuat(down, seg(4))),
      frame(a.shoulderR, dirQuat(down, seg(5))),
      frame(a.elbowR, dirQuat(down, seg(6))),
      frame(a.hipL, dirQuat(down, seg(7))),
      frame(a.kneeL, dirQuat(down, seg(8))),
      frame(a.hipR, dirQuat(down, seg(9))),
      frame(a.kneeR, dirQuat(down, seg(10))),
      frame(a.ankleL, I),
      frame(a.ankleR, I),
    ];
    this.scene.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones, inv);

    // ---- メッシュ ----
    const P = new Float32Array(bin, 0, meta.totalV * 3);
    const SW = new Float32Array(bin, meta.totalV * 12, meta.totalV * 4);
    const SI8 = new Uint8Array(bin, meta.totalV * 12 + meta.totalV * 16, meta.totalV * 4);
    const IDX = new Uint32Array(bin.slice(meta.totalV * 12 + meta.totalV * 16 + meta.totalV * 4, meta.totalV * 12 + meta.totalV * 16 + meta.totalV * 4 + meta.totalI * 4));
    for (const p of meta.parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(P.slice(p.vOff * 3, (p.vOff + p.vCount) * 3), 3));
      g.setAttribute("skinWeight", new THREE.BufferAttribute(SW.slice(p.vOff * 4, (p.vOff + p.vCount) * 4), 4));
      g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(Uint16Array.from(SI8.subarray(p.vOff * 4, (p.vOff + p.vCount) * 4)), 4));
      g.setIndex(new THREE.BufferAttribute(IDX.slice(p.iOff, p.iOff + p.iCount), 1));
      g.computeVertexNormals();
      const mesh = new THREE.SkinnedMesh(g, p.kind === "bone" ? this.boneMat : this.mat(p.group));
      mesh.bind(skeleton, new THREE.Matrix4());
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.meshes.push({ mesh, name: p.name, kind: p.kind, group: p.group });
    }
  }

  /** デバッグ用: 名前が正規表現に合う部品だけ表示する(nullで全表示) */
  only(re: RegExp | null) {
    for (const m of this.meshes) m.mesh.visible = !re || re.test(m.kind + " " + m.group + " " + m.name);
  }

  private buildProps() {
    const mat = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.5, metalness: 0.35 });
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x2d9cff, roughness: 0.35, metalness: 0.25, emissive: 0x0a3a70, emissiveIntensity: 0.5 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0xd5d9e2, roughness: 0.3, metalness: 0.6 });
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 12), gripMat);
      handle.rotation.z = Math.PI / 2;
      g.add(handle);
      for (const x of [-0.09, 0.09]) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.045, 6), plateMat);
        plate.rotation.z = Math.PI / 2;
        plate.position.x = x;
        plate.castShadow = true;
        g.add(plate);
      }
      g.visible = false;
      this.scene.add(g);
      this.dumbbells.push(g);
    }
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
    n.root.rotation.set(-flex, tw, abd, "XZY");
    n.mid.rotation.set(kind === "arm" ? -rad(fk.bend ?? 0) : rad(fk.bend ?? 0), 0, 0);
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
    const { U, F, T, S } = this.dims;
    if ("fk" in limb) this.applyFK(n, limb.fk, side, kind);
    else if (kind === "arm") this.applyIK(n, limb.ik, U, F, [0.25 * s, -1, -0.35]);
    else this.applyIK(n, limb.ik, T, S, [0.15 * s, 0, 1]);
    this.scene.updateMatrixWorld(true);
  }

  applyPose(p: Pose) {
    const { root, torso, head } = this;
    root.position.set(...(p.root?.pos ?? [0, this.dims.hipY, 0]));
    root.rotation.set(rad(p.root?.rx ?? 0), rad(p.root?.ry ?? 0), rad(p.root?.rz ?? 0));
    torso.rotation.set(rad(p.torso?.lean ?? 0), rad(p.torso?.twist ?? 0), rad(p.torso?.side ?? 0));
    head.rotation.set(rad(p.head?.nod ?? 0), 0, 0);
    this.scene.updateMatrixWorld(true);

    this.applyLimb(this.legs.L, p.legL, "L", "leg");
    this.applyLimb(this.legs.R, p.legR, "R", "leg");
    this.applyLimb(this.arms.L, p.armL, "L", "arm");
    this.applyLimb(this.arms.R, p.armR, "R", "arm");

    for (const side of ["L", "R"] as Side[]) {
      const n = this.legs[side];
      const s = side === "L" ? 1 : -1;
      const fp = Array.isArray(p.footPitch) ? p.footPitch[side === "L" ? 0 : 1] : (p.footPitch ?? 0);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(fp), rad((p.footYaw ?? 8) * s), 0, "YXZ"));
      n.end.quaternion.copy(this.worldQuat(n.mid).invert().multiply(q));
    }
    this.scene.updateMatrixWorld(true);

    this.dumbbells.forEach((d) => (d.visible = false));
    if (p.held) {
      const sides = p.held.sides ?? ["L", "R"];
      sides.forEach((side, i) => {
        const wr = this.arms[side];
        const w = this.worldPos(wr.end);
        const el = this.worldPos(wr.mid);
        const dir = w.clone().sub(el).normalize();
        const d = this.dumbbells[i];
        d.visible = true;
        d.position.copy(w.clone().add(dir.multiplyScalar(0.05)));
        d.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.dirToWorld(p.held!.axis, p.held!.frame).normalize());
      });
    }
    if (p.heldTwo) {
      const c = this.worldPos(this.arms.L.end).add(this.worldPos(this.arms.R.end)).multiplyScalar(0.5);
      if (p.heldTwo.offset) c.add(this.dirToWorld(p.heldTwo.offset, p.heldTwo.frame));
      const d = this.dumbbells[0];
      d.visible = true;
      d.position.copy(c);
      d.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.dirToWorld(p.heldTwo.axis, p.heldTwo.frame).normalize());
    }

    this.bench.visible = !!p.bench;
    if (p.bench) {
      this.bench.position.set(...p.bench.pos);
      this.bench.rotation.y = rad(p.bench.ry ?? 0);
      this.benchBack.rotation.x = rad(p.bench.incline ?? 0);
    }
    this.pushBars.visible = !!p.pushBars;
    if (p.pushBars) this.pushBars.position.set(...p.pushBars[0]);
  }

  /** 強調する筋肉: primary=濃いオレンジ、secondary=黄。level=0..1で発光の強さが変化 */
  highlight(primary: Region[], secondary: Region[], level: number) {
    for (const [group, mat] of this.groups) {
      const isP = (primary as string[]).includes(group);
      const isS = !isP && (secondary as string[]).includes(group);
      if (!isP && !isS) {
        mat.color.setHex(MUSCLE_NEUTRAL);
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
        continue;
      }
      const col = isP ? 0xff4d12 : 0xffb238;
      mat.color.setHex(col);
      mat.emissive.setHex(col);
      mat.emissiveIntensity = 0.25 + 0.6 * level;
    }
  }
}
