import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cardboardTexture, signTexture, wrapTexture } from './textures.js';

const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts });

export const MAT = {
  floor: std('#eef2f7', { roughness: 0.92 }),
  wall: std('#f3f5f9', { roughness: 0.95 }),
  wallTrim: std('#dfe5ee'),
  ground: std('#e2e8f0', { roughness: 1 }),
  rackBlue: std('#1f5fd6', { roughness: 0.45, metalness: 0.2 }),
  rackOrange: std('#f39a2c', { roughness: 0.5, metalness: 0.1 }),
  pallet: std('#c79a63', { roughness: 0.95 }),
  carton: std('#ffffff', { map: cardboardTexture(), roughness: 0.85 }),
  wrap: std('#ffffff', { map: wrapTexture(), roughness: 0.35, metalness: 0.05 }),
  dark: std('#27303f', { roughness: 0.6 }),
  steel: std('#8a95a6', { roughness: 0.35, metalness: 0.6 }),
  tire: std('#1b2029', { roughness: 0.9 }),
  yellow: std('#f5c518', { roughness: 0.5 }),
  white: std('#f8fafc', { roughness: 0.6 }),
  blue: std('#2563eb', { roughness: 0.45 }),
  navy: std('#25324d', { roughness: 0.8 }),
  skin: std('#f0c6a0', { roughness: 0.8 }),
  screen: std('#0f172a', { roughness: 0.3, emissive: '#1e3a8a', emissiveIntensity: 0.35 }),
  glass: std('#9ec5ff', { roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.55 }),
  leaf: std('#4c9a5b', { roughness: 0.9 }),
  leafDark: std('#3c8049', { roughness: 0.9 }),
  lineYellow: new THREE.MeshBasicMaterial({ color: '#f2c230' }),
  lineWhite: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
};

const CARTON_COLORS = ['#d9a66b', '#cf9a5d', '#e2b47c', '#c8925a', '#dcaa70'].map((c) => new THREE.Color(c));
const WRAP_COLORS = ['#e8ecf2', '#dde3ea', '#eef1f6', '#d6dde7'].map((c) => new THREE.Color(c));

export function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function mesh(geometry, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// 乱数の再現性を保つための簡易 PRNG
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- パレットと荷物 ----------

export const PALLET = { width: 1.2, depth: 1.0, top: 0.135 };

let palletGeo;
function palletGeometry() {
  if (palletGeo) return palletGeo;
  const parts = [];
  for (let i = 0; i < 7; i++) parts.push(box(0.13, 0.03, 1.0, -0.535 + i * 0.178, 0.12, 0));
  for (const x of [-0.52, 0, 0.52]) {
    for (const z of [-0.43, 0, 0.43]) parts.push(box(0.14, 0.08, 0.14, x, 0.065, z));
  }
  for (const z of [-0.43, 0, 0.43]) parts.push(box(1.2, 0.025, 0.14, 0, 0.0125, z));
  palletGeo = mergeGeometries(parts);
  return palletGeo;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);

// パレット 1 枚分の荷物の並び（パレット中心・床面が原点）
export function loadLayout(rng, style = 'carton') {
  const out = [];
  if (style === 'wrap') {
    const h = 0.75 + rng() * 0.45;
    out.push({ kind: 'wrap', p: [0, PALLET.top + h / 2, 0], s: [1.16, h, 0.98], c: WRAP_COLORS[Math.floor(rng() * WRAP_COLORS.length)] });
    return out;
  }
  const layers = 2 + Math.floor(rng() * 2);
  const bh = 0.3 + rng() * 0.05;
  for (let l = 0; l < layers; l++) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (l === layers - 1 && l > 0 && rng() < 0.3) continue;
        out.push({
          kind: 'carton',
          p: [(i - 1) * 0.395, PALLET.top + bh * (l + 0.5) + l * 0.004, (j - 1) * 0.325],
          s: [0.385, bh, 0.315],
          c: CARTON_COLORS[Math.floor(rng() * CARTON_COLORS.length)],
        });
      }
    }
  }
  return out;
}

// 多数のパレットと箱を InstancedMesh にまとめる
export class Batch {
  constructor() {
    this.pallets = [];
    this.items = { carton: [], wrap: [] };
  }

  addLoad(base, rng, style = 'carton') {
    this.pallets.push(base.clone());
    this.addItems(base, loadLayout(rng, style));
  }

  addItems(base, layout) {
    const q = new THREE.Quaternion();
    for (const item of layout) {
      const local = new THREE.Matrix4().compose(new THREE.Vector3(...item.p), q, new THREE.Vector3(...item.s));
      this.items[item.kind].push({ m: base.clone().multiply(local), c: item.c });
    }
  }

  build(parent) {
    const meshes = [];
    if (this.pallets.length) {
      const pallets = new THREE.InstancedMesh(palletGeometry(), MAT.pallet, this.pallets.length);
      this.pallets.forEach((m, i) => pallets.setMatrixAt(i, m));
      meshes.push(pallets);
    }
    for (const kind of ['carton', 'wrap']) {
      const list = this.items[kind];
      if (!list.length) continue;
      const inst = new THREE.InstancedMesh(unitBox, MAT[kind], list.length);
      list.forEach((item, i) => {
        inst.setMatrixAt(i, item.m);
        inst.setColorAt(i, item.c);
      });
      meshes.push(inst);
    }
    for (const m of meshes) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.computeBoundingSphere();
      parent.add(m);
    }
    return meshes;
  }
}

// 動かせる 1 枚のパレット（フォークリフトが運ぶ・クリックで選ぶ）
export function createPalletUnit(rng, style = 'carton') {
  const group = new THREE.Group();
  const batch = new Batch();
  batch.addLoad(new THREE.Matrix4(), rng, style);
  batch.build(group);
  return group;
}

// ---------- ラック ----------

// 原点は正面左下。+x 方向に棚が並び、正面は +z を向く
export function createRack({ bays = 5, levels = 2, bayW = 2.8, depth = 1.1, levelH = 1.6, label, rng }) {
  const group = new THREE.Group();
  const height = levels * levelH + 0.45;
  const blue = [];
  const orange = [];
  for (let k = 0; k <= bays; k++) {
    const x = k * bayW;
    for (const z of [0, -depth]) blue.push(box(0.1, height, 0.1, x, height / 2, z));
    for (let y = 0.3; y < height; y += 0.9) blue.push(box(0.05, 0.05, depth, x, y, -depth / 2));
    for (let y = 0.3; y + 0.9 < height; y += 0.9) {
      const diag = box(0.04, Math.hypot(0.9, depth), 0.04);
      diag.rotateX(Math.atan2(depth, 0.9) * (Math.round(y / 0.9) % 2 ? 1 : -1));
      diag.translate(x, y + 0.45, -depth / 2);
      blue.push(diag);
    }
  }
  for (let l = 1; l <= levels; l++) {
    for (let k = 0; k < bays; k++) {
      for (const z of [0.02, -depth - 0.02]) orange.push(box(bayW - 0.1, 0.13, 0.06, (k + 0.5) * bayW, l * levelH, z));
    }
  }
  group.add(mesh(mergeGeometries(blue), MAT.rackBlue));
  group.add(mesh(mergeGeometries(orange), MAT.rackOrange));

  // 棚に置くパレットの位置（ローカル座標）
  const slots = [];
  for (let k = 0; k < bays; k++) {
    for (let l = 0; l <= levels; l++) {
      for (const f of [0.27, 0.73]) {
        if (rng && rng() < 0.12) continue;
        slots.push(new THREE.Vector3(k * bayW + f * bayW, l === 0 ? 0 : l * levelH + 0.065, -depth / 2));
      }
    }
  }

  let sign = null;
  if (label) {
    const material = new THREE.MeshBasicMaterial({ map: signTexture(label), transparent: true, side: THREE.DoubleSide, toneMapped: false });
    sign = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.9), material);
    sign.position.set(0.15, height + 0.65, 0.05);
    group.add(sign);
    const post = mesh(box(0.06, 0.6, 0.06, 0.15, height + 0.2, 0.02), MAT.rackBlue);
    group.add(post);
  }

  return { group, slots, sign, height, length: bays * bayW };
}

// ---------- フォークリフト ----------

// 前方（フォーク側）が +z
export function createForklift(color = '#2563eb') {
  const group = new THREE.Group();
  const body = std(color, { roughness: 0.4, metalness: 0.1 });
  const add = (geo, mat, parent = group) => {
    const m = mesh(geo, mat);
    parent.add(m);
    return m;
  };

  add(box(1.12, 0.5, 1.9, 0, 0.55, -0.4), body);
  add(box(1.16, 0.62, 0.5, 0, 1.0, -1.15), body);
  add(box(1.0, 0.08, 0.8, 0, 0.84, 0.2), MAT.dark);
  add(box(0.5, 0.1, 0.48, 0, 0.92, -0.55), MAT.dark);
  add(box(0.5, 0.5, 0.1, 0, 1.18, -0.8), MAT.dark);
  for (const x of [-0.5, 0.5]) {
    add(box(0.06, 1.36, 0.06, x, 1.5, 0.3), MAT.dark);
    add(box(0.06, 1.0, 0.06, x, 1.68, -1.05), MAT.dark);
  }
  add(box(1.1, 0.06, 1.45, 0, 2.18, -0.37), MAT.dark);
  const wheelSteer = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16);
  wheelSteer.rotateX(-0.9);
  wheelSteer.translate(0, 1.25, 0.05);
  add(wheelSteer, MAT.dark);

  for (const x of [-0.38, 0.38]) add(box(0.08, 2.4, 0.1, x, 1.25, 0.68), MAT.dark);
  add(box(0.84, 0.08, 0.1, 0, 2.42, 0.68), MAT.dark);
  add(box(0.84, 0.06, 0.08, 0, 0.32, 0.68), MAT.dark);

  const carriage = new THREE.Group();
  group.add(carriage);
  add(box(0.9, 0.06, 0.05, 0, 0.75, 0.77), MAT.dark, carriage);
  add(box(0.9, 0.06, 0.05, 0, 0.35, 0.77), MAT.dark, carriage);
  for (const x of [-0.3, 0, 0.3]) add(box(0.04, 0.5, 0.04, x, 0.55, 0.77), MAT.dark, carriage);
  for (const x of [-0.26, 0.26]) {
    add(box(0.11, 0.05, 1.15, x, 0.05, 1.37), MAT.steel, carriage);
    add(box(0.11, 0.42, 0.05, x, 0.23, 0.8), MAT.steel, carriage);
  }

  const wheel = (r, w, x, z) => {
    const g = new THREE.CylinderGeometry(r, r, w, 18);
    g.rotateZ(Math.PI / 2);
    g.translate(x, r, z);
    add(g, MAT.tire);
  };
  for (const x of [-0.52, 0.52]) {
    wheel(0.3, 0.24, x, 0.25);
    wheel(0.24, 0.2, x, -1.05);
  }

  // 運転手
  const driver = createWorker({ shirt: '#1e5ad6', seated: true });
  driver.position.set(0, 0.9, -0.5);
  driver.scale.setScalar(0.9);
  group.add(driver);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 8),
    new THREE.MeshStandardMaterial({ color: '#ff9f1c', emissive: '#ff8a00', emissiveIntensity: 2 }),
  );
  beacon.position.set(0, 2.27, -0.9);
  group.add(beacon);

  return { group, carriage, beacon };
}

// ---------- 作業員 ----------

export function createWorker({ shirt = '#1e5ad6', tablet = false, seated = false } = {}) {
  const group = new THREE.Group();
  const shirtMat = std(shirt, { roughness: 0.7 });
  const add = (geo, mat, x, y, z) => {
    const m = mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  if (!seated) {
    for (const x of [-0.1, 0.1]) add(new THREE.CapsuleGeometry(0.085, 0.55, 4, 8), MAT.navy, x, 0.4, 0);
  }
  const torso = add(new THREE.CapsuleGeometry(0.19, 0.32, 4, 12), shirtMat, 0, seated ? 0.35 : 1.08, 0);
  torso.scale.set(1, 1, 0.75);
  const yOff = seated ? -0.73 : 0;
  add(new THREE.SphereGeometry(0.13, 16, 12), MAT.skin, 0, 1.53 + yOff, 0);
  const cap = add(new THREE.SphereGeometry(0.14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), shirtMat, 0, 1.56 + yOff, 0);
  cap.castShadow = false;
  add(box(0.18, 0.02, 0.12), shirtMat, 0, 1.57 + yOff, 0.12);
  const armL = add(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), shirtMat, -0.26, 1.1 + yOff, 0);
  const armR = add(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), shirtMat, 0.26, 1.1 + yOff, 0);
  armL.rotation.z = 0.12;
  armR.rotation.z = -0.12;
  if (tablet) {
    armR.rotation.set(-1.0, 0, -0.25);
    armR.position.set(0.2, 1.15, 0.14);
    armL.rotation.set(-1.0, 0, 0.25);
    armL.position.set(-0.2, 1.15, 0.14);
    const pad = add(box(0.3, 0.02, 0.22), MAT.screen, 0, 1.2, 0.34);
    pad.rotation.x = -0.6;
  }
  if (seated) {
    armL.rotation.set(-1.1, 0, 0.1);
    armR.rotation.set(-1.1, 0, -0.1);
    armL.position.z = armR.position.z = 0.15;
  }
  return group;
}

// ---------- トラック ----------

// 荷台の開口部が +x
export function createTruck(rng) {
  const group = new THREE.Group();
  const add = (geo, mat) => group.add(mesh(geo, mat));
  const L = 6.2;
  const W = 2.5;
  const H = 2.6;
  const y0 = 1.0;
  add(box(L, 0.1, W, 0, y0, 0), MAT.wallTrim);
  add(box(L, 0.1, W, 0, y0 + H, 0), MAT.white);
  add(box(L, H, 0.08, 0, y0 + H / 2, W / 2), MAT.white);
  add(box(L, H, 0.08, 0, y0 + H / 2, -W / 2), MAT.white);
  add(box(0.08, H, W, -L / 2, y0 + H / 2, 0), MAT.white);
  add(box(L - 0.4, 0.22, 0.02, -0.1, y0 + 0.5, W / 2 + 0.05), MAT.blue);
  add(box(0.1, H, 0.12, L / 2, y0 + H / 2, W / 2), MAT.wallTrim);
  add(box(0.1, H, 0.12, L / 2, y0 + H / 2, -W / 2), MAT.wallTrim);
  // 開いた扉
  add(box(W / 2, H - 0.1, 0.06, L / 2 + W / 4, y0 + H / 2, W / 2 + 0.06), MAT.white);
  add(box(W / 2, H - 0.1, 0.06, L / 2 + W / 4, y0 + H / 2, -W / 2 - 0.06), MAT.white);

  add(box(L + 1.5, 0.35, 1.6, -0.7, 0.7, 0), MAT.dark);
  add(box(1.7, 2.1, W - 0.1, -L / 2 - 1.05, 1.75, 0), MAT.white);
  add(box(0.05, 0.8, W - 0.4, -L / 2 - 1.92, 2.2, 0), MAT.screen);
  add(box(1.72, 0.2, W - 0.08, -L / 2 - 1.05, 1.0, 0), MAT.blue);
  for (const x of [-L / 2 - 1.2, 1.2, 2.3]) {
    for (const z of [-W / 2 + 0.2, W / 2 - 0.2]) {
      const g = new THREE.CylinderGeometry(0.45, 0.45, 0.32, 20);
      g.rotateX(Math.PI / 2);
      g.translate(x, 0.45, z);
      add(g, MAT.tire);
    }
  }

  // 荷台の中の箱
  const batch = new Batch();
  for (let i = 0; i < 6; i++) {
    for (const z of [-0.6, 0.6]) {
      if (i > 3 && z > 0) continue;
      const base = new THREE.Matrix4().makeTranslation(-2.6 + i * 1.05, y0 + 0.05, z);
      batch.addItems(base, loadLayout(rng, 'carton').filter((b) => b.p[1] < 1.5));
    }
  }
  batch.build(group);
  return group;
}

// ---------- 小物 ----------

export function createBollard() {
  const group = new THREE.Group();
  const g = new THREE.CylinderGeometry(0.1, 0.1, 0.9, 12);
  g.translate(0, 0.45, 0);
  group.add(mesh(g, MAT.yellow));
  const band = new THREE.CylinderGeometry(0.102, 0.102, 0.08, 12);
  band.translate(0, 0.7, 0);
  group.add(mesh(band, MAT.dark));
  return group;
}

// 2 点間の黄色いガードレール
export function createRail(x1, z1, x2, z2) {
  const group = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.round(len / 2));
  const parts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    parts.push(box(0.1, 0.9, 0.1, x1 + (x2 - x1) * t, 0.45, z1 + (z2 - z1) * t));
  }
  for (const y of [0.85, 0.45]) {
    const rail = box(len, 0.08, 0.06);
    rail.rotateY(-Math.atan2(z2 - z1, x2 - x1));
    rail.translate((x1 + x2) / 2, y, (z1 + z2) / 2);
    parts.push(rail);
  }
  group.add(mesh(mergeGeometries(parts), MAT.yellow));
  return group;
}

export function createBush(rng) {
  const group = new THREE.Group();
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.45 + rng() * 0.35;
    const m = mesh(new THREE.IcosahedronGeometry(r, 1), rng() < 0.5 ? MAT.leaf : MAT.leafDark);
    m.position.set((rng() - 0.5) * 1.2, r * 0.9, (rng() - 0.5) * 1.2);
    group.add(m);
  }
  return group;
}
