// 動作GIF生成用の描画ページ。tools/build-motions.mjs から呼ばれる。
import * as THREE from "three";
import { Rig, type Region } from "./rig";
import { MOTIONS } from "./motions";
import { INITIAL_EXERCISES } from "../../src/domain/exercises";

const W = 420;
const H = 560;
const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const rig = new Rig();
const scene = rig.scene;
scene.background = new THREE.Color(0x0d111d);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a2033, 0.95));
const key = new THREE.DirectionalLight(0xfff1e0, 1.7);
key.position.set(2.2, 4, 3);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -2;
key.shadow.camera.right = 2;
key.shadow.camera.top = 2;
key.shadow.camera.bottom = -2;
key.shadow.radius = 5;
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.DirectionalLight(0x6ea8ff, 1.6); // 輪郭を浮かせる寒色のリムライト
rim.position.set(-3, 2.5, -3);
scene.add(rim);
const fill = new THREE.DirectionalLight(0x8899ff, 0.45);
fill.position.set(-2, 1, 3);
scene.add(fill);

// 床: 単色の円形ステージ(グラデーションはGIFの256色で縞になるため使わない)
const stage = new THREE.Mesh(new THREE.CircleGeometry(1.3, 64), new THREE.MeshBasicMaterial({ color: 0x171d31 }));
stage.rotation.x = -Math.PI / 2;
stage.position.y = -0.003;
scene.add(stage);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.5 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 50);

const REGION_OF: Record<string, Region[]> = {
  大胸筋: ["pec", "upperpec"],
  大胸筋上部: ["upperpec"],
  三角筋: ["delt_front", "delt_mid", "delt_rear"],
  三角筋前部: ["delt_front"],
  三角筋中部: ["delt_mid"],
  三角筋後部: ["delt_rear"],
  広背筋: ["lat"],
  僧帽筋: ["trap"],
  上腕二頭筋: ["biceps"],
  上腕三頭筋: ["triceps"],
  大腿四頭筋: ["quad"],
  ハムストリングス: ["hamstring"],
  臀筋: ["glute"],
  体幹: ["core"],
  脊柱起立筋: ["erector"],
};
const regions = (names: string[]) => names.flatMap((n) => REGION_OF[n] ?? []);

const ids = INITIAL_EXERCISES.map((e) => e.id).filter((id) => MOTIONS[id]);
const missing = INITIAL_EXERCISES.map((e) => e.id).filter((id) => !MOTIONS[id]);

declare global {
  interface Window {
    __ids: string[];
    __missing: string[];
    __renderFrame: (id: string, phase: number) => void;
  }
}
window.__ids = ids;
window.__missing = missing;
window.__renderFrame = (id, phase) => {
  const m = MOTIONS[id];
  const ex = INITIAL_EXERCISES.find((e) => e.id === id)!;
  const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
  rig.applyPose(m.pose(k));
  rig.highlight(regions([ex.primaryMuscle]), regions(ex.secondaryMuscles), m.effort ? m.effort(k) : k);
  const c = m.cam;
  // 立体感を出すため、視点をゆるく左右に振る
  const az = ((c.az + 9 * Math.sin(2 * Math.PI * phase)) * Math.PI) / 180;
  const el = ((c.el ?? 8) * Math.PI) / 180;
  const d = c.dist ?? 5.0;
  const t = new THREE.Vector3(...(c.target ?? [0, 0.98, 0]));
  camera.position.set(t.x + d * Math.sin(az) * Math.cos(el), t.y + d * Math.sin(el), t.z + d * Math.cos(az) * Math.cos(el));
  camera.lookAt(t);
  renderer.render(scene, camera);
};
