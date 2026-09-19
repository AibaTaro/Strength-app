// 動作GIF生成用の描画ページ。tools/build-motions.mjs から呼ばれる。
import * as THREE from "three";
import { Rig, type Region } from "./rig";
import { MOTIONS } from "./motions";
import { INITIAL_EXERCISES } from "../../src/domain/exercises";

const W = 360;
const H = 480;
const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const rig = new Rig();
const scene = rig.scene;
scene.background = new THREE.Color(0xf3f4f8);
scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe3ee, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(2.2, 4, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -2;
sun.shadow.camera.right = 2;
sun.shadow.camera.top = 2;
sun.shadow.camera.bottom = -2;
sun.shadow.radius = 4;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.22 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const ring = new THREE.Mesh(
  new THREE.CircleGeometry(0.95, 48),
  new THREE.MeshBasicMaterial({ color: 0xe6e9f1 })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = -0.002;
scene.add(ring);

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
  const az = (c.az * Math.PI) / 180;
  const el = ((c.el ?? 8) * Math.PI) / 180;
  const d = c.dist ?? 5.0;
  const t = new THREE.Vector3(...(c.target ?? [0, 0.98, 0]));
  camera.position.set(t.x + d * Math.sin(az) * Math.cos(el), t.y + d * Math.sin(el), t.z + d * Math.cos(az) * Math.cos(el));
  camera.lookAt(t);
  renderer.render(scene, camera);
};
