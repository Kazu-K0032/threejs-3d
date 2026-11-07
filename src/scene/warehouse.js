import * as THREE from 'three';
import {
  Batch,
  MAT,
  box,
  createBollard,
  createBush,
  createForklift,
  createPalletUnit,
  createRack,
  createRail,
  createTruck,
  createWorker,
  mesh,
  seeded,
} from './props.js';
import { floorTexture, textDecal } from './textures.js';

// 床の範囲（x: -20..20, z: -15..15）
export const FLOOR = { minX: -20, maxX: 20, minZ: -15, maxZ: 15 };

// カメラが向く方位角。看板をカメラへ向けるために使う
export const CAMERA_YAW = Math.atan2(1, 1.15);

const RACKS = [
  { label: 'A1', origin: [-12, -13.4], yaw: 0, bays: 6, signAtEnd: false },
  { label: 'A2', origin: [-4, -8.4], yaw: 0, bays: 5, signAtEnd: false },
  { label: 'B1', origin: [17.6, -13], yaw: -Math.PI / 2, bays: 4, signAtEnd: true },
];

// ゾーンコード → ピック対象パレットを置く床の位置
const PICK_SPOTS = {
  'A2-03': [4.5, -3.6],
  'A2-05': [9.6, -3.6],
  'A1-04': [-7.6, -4.2],
  'B1-01': [14.4, -10.2],
};

const STAGING_ROWS = [12.6, 10.9, 9.2, 7.5];
const STAGING_COLS = [11, 12.9, 14.8, 16.7, 18.6];

export function buildWarehouse(scene) {
  const rng = seeded(7);
  const root = new THREE.Group();
  scene.add(root);
  const updaters = [];
  const batch = new Batch();

  buildShell(root, rng);
  buildMarkings(root);

  // ラック
  for (const def of RACKS) {
    const rack = createRack({ bays: def.bays, levels: 2, label: def.label, rng });
    rack.group.position.set(def.origin[0], 0, def.origin[1]);
    rack.group.rotation.y = def.yaw;
    root.add(rack.group);
    if (rack.sign) {
      if (def.signAtEnd) rack.sign.position.x = rack.length - 0.15;
      rack.sign.rotation.y = CAMERA_YAW - def.yaw;
    }
    rack.group.updateMatrixWorld(true);
    for (const slot of rack.slots) {
      const base = new THREE.Matrix4().makeTranslation(slot.x, slot.y, slot.z).premultiply(rack.group.matrixWorld);
      batch.addLoad(base, rng, rng() < 0.3 ? 'wrap' : 'carton');
    }
  }

  // 入荷エリア
  const truck = createTruck(rng);
  truck.position.set(-15.6, 0, -5);
  root.add(truck);
  for (const [x, z, style] of [
    [-16.2, 1.6, 'carton'],
    [-16.2, 3.2, 'carton'],
    [-14.6, 1.6, 'wrap'],
    [-17.6, 6.5, 'carton'],
    [-16.0, 6.5, 'wrap'],
  ]) {
    batch.addLoad(new THREE.Matrix4().makeTranslation(x, 0, z), rng, style);
  }

  // 出荷待機エリアの奥の固定パレット
  for (const x of [11, 12.9, 14.8, 16.7, 18.6]) {
    batch.addLoad(new THREE.Matrix4().makeTranslation(x, 0, 14.3), rng, 'wrap');
  }
  batch.build(root);

  buildPacking(root, rng, updaters);

  // 巡回するフォークリフト（ラック通路）
  const patrol = createForklift('#2f6bea');
  root.add(patrol.group);
  const patrolLoad = createPalletUnit(rng, 'wrap');
  patrolLoad.position.set(0, 0.08, 1.4);
  patrol.carriage.add(patrolLoad);
  patrol.carriage.position.y = 0.35;
  const patrolPath = new THREE.CatmullRomCurve3(
    [
      [-9, -11.45],
      [8, -11.45],
      [11.2, -10.3],
      [11.4, -7.4],
      [8, -6.2],
      [-6, -6.2],
      [-9.6, -7.6],
      [-10.4, -10.2],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  const patrolLength = patrolPath.getLength();
  let patrolS = 0;
  updaters.push((dt) => {
    patrolS = (patrolS + (dt * 2.2) / patrolLength) % 1;
    const p = patrolPath.getPointAt(patrolS);
    const t = patrolPath.getTangentAt(patrolS);
    patrol.group.position.copy(p);
    patrol.group.rotation.y = Math.atan2(t.x, t.z);
  });

  // 停車して荷役中のフォークリフト
  for (const [x, z, yaw, phase] of [
    [15.9, -2.8, Math.PI / 2, 0],
    [-10.8, -2.2, -Math.PI / 2, 2],
  ]) {
    const lift = createForklift('#2563eb');
    lift.group.position.set(x, 0, z);
    lift.group.rotation.y = yaw;
    root.add(lift.group);
    updaters.push((dt, time) => {
      lift.carriage.position.y = (Math.sin(time * 0.6 + phase) * 0.5 + 0.5) * 1.2;
    });
  }

  // 入荷エリアの作業員
  const inspector = createWorker({ tablet: true });
  inspector.position.set(-13.4, 0, 3.8);
  inspector.rotation.y = -2.2;
  root.add(inspector);

  // 屋外の植栽
  const bushRng = seeded(3);
  for (let x = -24; x < 4; x += 1.8 + bushRng() * 0.8) {
    const bush = createBush(bushRng);
    bush.position.set(x, -0.4, 16.6 + bushRng() * 1.2);
    root.add(bush);
  }

  const spots = {};
  for (const [zone, [x, z]] of Object.entries(PICK_SPOTS)) {
    spots[zone] = { pos: new THREE.Vector3(x, 0, z), front: new THREE.Vector3(0, 0, 1) };
  }

  const slots = [];
  for (const z of STAGING_ROWS) for (const x of STAGING_COLS) slots.push(new THREE.Vector3(x, 0, z));

  return {
    root,
    spots,
    slots,
    home: new THREE.Vector3(8, 0, 3.8),
    update(dt, time) {
      for (const fn of updaters) fn(dt, time);
    },
  };
}

function buildShell(root, rng) {
  const W = FLOOR.maxX - FLOOR.minX;
  const D = FLOOR.maxZ - FLOOR.minZ;

  const ground = mesh(new THREE.PlaneGeometry(220, 220), MAT.ground, { cast: false });
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  root.add(ground);

  const tex = floorTexture();
  tex.repeat.set(W / 2, D / 2);
  const floorMat = MAT.floor.clone();
  floorMat.map = tex;
  const floor = mesh(box(W, 0.4, D, 0, -0.2, 0), floorMat, { cast: false });
  root.add(floor);
  const curb = mesh(box(W + 0.2, 0.42, D + 0.2, 0, -0.21, 0), MAT.wallTrim, { cast: false });
  curb.position.y = -0.005;
  root.add(curb);

  const wallH = 6.2;
  const t = 0.3;
  // 奥の壁
  root.add(mesh(box(W + t, wallH, t, 0, wallH / 2, FLOOR.minZ - t / 2), MAT.wall));
  root.add(mesh(box(W + t, 0.25, t + 0.06, 0, 0.12, FLOOR.minZ - t / 2), MAT.wallTrim));
  for (let x = -14; x <= 16; x += 4) {
    root.add(mesh(box(3.2, 0.7, 0.05, x, 5.1, FLOOR.minZ + 0.02), MAT.glass, { cast: false }));
  }
  // 通用口
  root.add(mesh(box(1.1, 2.2, 0.08, -17, 1.1, FLOOR.minZ + 0.04), MAT.blue));

  // 左の壁（ドックの開口部を残す）
  const doors = [
    { z: -5, label: '01' },
    { z: 2.5, label: '02' },
  ];
  const doorW = 3.4;
  const doorH = 3.9;
  const x = FLOOR.minX - t / 2;
  let zCursor = FLOOR.minZ - t;
  for (const door of doors) {
    const z0 = door.z - doorW / 2;
    root.add(mesh(box(t, wallH, z0 - zCursor, x, wallH / 2, (zCursor + z0) / 2), MAT.wall));
    root.add(mesh(box(t, wallH - doorH, doorW, x, doorH + (wallH - doorH) / 2, door.z), MAT.wall));
    // 開口部の奥の暗がりと、半分上げたシャッター
    root.add(mesh(box(0.1, doorH, doorW, x - 1.2, doorH / 2, door.z), MAT.dark, { cast: false }));
    const shutter = mesh(box(0.12, 1.1, doorW - 0.1, x + 0.05, doorH - 0.55, door.z), MAT.white);
    root.add(shutter);
    for (let i = 0; i < 4; i++) {
      root.add(mesh(box(0.13, 0.03, doorW - 0.1, x + 0.06, doorH - 0.15 - i * 0.27, door.z), MAT.wallTrim, { cast: false }));
    }
    // 番号
    const decal = textDecal(door.label, { color: 'rgba(90,108,140,0.75)', px: 160 });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5 * decal.aspect, 1.5),
      new THREE.MeshBasicMaterial({ map: decal.texture, transparent: true }),
    );
    sign.position.set(x + t / 2 + 0.01, doorH + 1.15, door.z);
    sign.rotation.y = Math.PI / 2;
    root.add(sign);
    // ドックレベラーとバンパー
    root.add(mesh(box(1.6, 0.06, doorW - 0.4, FLOOR.minX + 0.8, 0.03, door.z), MAT.steel, { cast: false }));
    for (const dz of [-doorW / 2 - 0.15, doorW / 2 + 0.15]) {
      root.add(mesh(box(0.25, 0.5, 0.25, FLOOR.minX + 0.12, 0.6, door.z + dz), MAT.dark));
      const bollard = createBollard();
      bollard.position.set(FLOOR.minX + 1.4, 0, door.z + dz);
      root.add(bollard);
    }
    zCursor = door.z + doorW / 2;
  }
  root.add(mesh(box(t, wallH, FLOOR.maxZ - zCursor, x, wallH / 2, (zCursor + FLOOR.maxZ) / 2), MAT.wall));

  // 天井の梁（壁の上端に沿わせる）
  root.add(mesh(box(W + t, 0.25, 0.4, 0, wallH, FLOOR.minZ - t / 2), MAT.wallTrim));
  root.add(mesh(box(0.4, 0.25, D + t, x, wallH, 0), MAT.wallTrim));

  // ラック端のガードと柵
  root.add(createRail(-6.9, 4.6, -6.9, 10.2));
  root.add(createRail(-6.9, 10.2, 7.4, 10.2));
  root.add(createRail(9.6, 13.7, 9.6, 6.4));
  for (const [bx, bz] of [
    [-12.4, -12.9],
    [-4.4, -7.9],
    [10.4, -7.9],
    [17.1, -1.4],
  ]) {
    const bollard = createBollard();
    bollard.position.set(bx, 0, bz);
    root.add(bollard);
  }
  void rng;
}

function floorLine(root, x1, z1, x2, z2, width = 0.12, material = MAT.lineYellow) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(len, width), material);
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = Math.atan2(-(z2 - z1), x2 - x1);
  line.position.set((x1 + x2) / 2, 0.006, (z1 + z2) / 2);
  line.receiveShadow = true;
  root.add(line);
}

function floorRect(root, x1, z1, x2, z2, width, material) {
  floorLine(root, x1, z1, x2, z1, width, material);
  floorLine(root, x2, z1, x2, z2, width, material);
  floorLine(root, x2, z2, x1, z2, width, material);
  floorLine(root, x1, z2, x1, z1, width, material);
}

// 床の文字。yaw は文字の流れる向き（0 で +x）
function floorText(root, lines, x, z, height, yaw, opts) {
  const decal = textDecal(lines, opts);
  const geo = new THREE.PlaneGeometry(height * decal.aspect, height);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: decal.texture, transparent: true, depthWrite: false }));
  m.position.set(x, 0.012, z);
  m.rotation.y = yaw;
  root.add(m);
}

function floorArrow(root, x, z, yaw, size = 1) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.5);
  shape.lineTo(0.45, 0);
  shape.lineTo(0.16, 0);
  shape.lineTo(0.16, -0.5);
  shape.lineTo(-0.16, -0.5);
  shape.lineTo(-0.16, 0);
  shape.lineTo(-0.45, 0);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#5d6f8f', transparent: true, opacity: 0.55, depthWrite: false }));
  m.scale.setScalar(size);
  m.position.set(x, 0.013, z);
  m.rotation.y = yaw;
  root.add(m);
}

function buildMarkings(root) {
  floorRect(root, -9.6, -7.0, 12.4, 2.0, 0.12, MAT.lineYellow);
  floorRect(root, 10.0, 6.6, 19.6, 13.6, 0.1, MAT.lineYellow);
  floorRect(root, -19.6, -7.6, -11.6, 8.2, 0.1, MAT.lineYellow);
  floorRect(root, -6.5, 4.8, 7.2, 9.8, 0.08, MAT.lineWhite);
  for (let i = 0; i < 6; i++) floorLine(root, -10.6, 2.9 + i * 0.36, -8.6, 2.9 + i * 0.36, 0.18, MAT.lineWhite);

  floorText(root, 'INBOUND', -13.4, 2.6, 1.3, Math.PI / 2);
  floorArrow(root, -13.4, -2.4, 0, 1.1);
  floorText(root, 'PICKING AREA', -2.2, 0.6, 1.1, 0);
  floorArrow(root, -7.4, 0.6, -Math.PI / 2, 0.9);
  floorText(root, ['OUTBOUND', 'STAGING'], 14.6, 4.3, 2.0, 0);
  floorArrow(root, 19.0, 4.3, -Math.PI / 2, 0.9);
}

function buildPacking(root, rng, updaters) {
  const cartonMat = MAT.carton.clone();
  cartonMat.color.set('#d9a66b');
  const toteMat = MAT.blue;

  for (const [i, x] of [-4, -0.4, 3.2].entries()) {
    const table = new THREE.Group();
    table.add(mesh(box(2.6, 0.08, 1.0, 0, 0.9, 0), MAT.white));
    for (const dx of [-1.2, 1.2]) for (const dz of [-0.42, 0.42]) table.add(mesh(box(0.06, 0.9, 0.06, dx, 0.45, dz), MAT.steel));
    table.add(mesh(box(2.4, 0.04, 0.8, 0, 0.3, 0), MAT.steel));
    table.add(mesh(box(0.55, 0.36, 0.05, -0.7, 1.32, -0.25), MAT.screen));
    table.add(mesh(box(0.06, 0.25, 0.06, -0.7, 1.05, -0.28), MAT.dark));
    table.add(mesh(box(0.5, 0.3, 0.4, 0.5, 1.09, 0.05), cartonMat));
    table.add(mesh(box(0.4, 0.25, 0.32, 0.95, 1.07, -0.2), cartonMat));
    table.add(mesh(box(0.5, 0.28, 0.4, 0.3, 0.46, 0), toteMat));
    table.position.set(x, 0, 6.6);
    root.add(table);

    const worker = createWorker({ shirt: '#1e5ad6' });
    worker.position.set(x + 0.2, 0, 5.75);
    root.add(worker);
    const phase = i * 1.7;
    updaters.push((dt, time) => {
      worker.rotation.y = Math.sin(time * 0.8 + phase) * 0.35;
      worker.position.y = Math.abs(Math.sin(time * 1.6 + phase)) * 0.02;
    });
  }

  // コンベヤー
  const conveyor = new THREE.Group();
  const x0 = -6;
  const x1 = 7;
  const z = 8.6;
  const len = x1 - x0;
  conveyor.add(mesh(box(len, 0.12, 0.08, (x0 + x1) / 2, 0.72, z - 0.38), MAT.steel));
  conveyor.add(mesh(box(len, 0.12, 0.08, (x0 + x1) / 2, 0.72, z + 0.38), MAT.steel));
  for (let lx = x0 + 0.3; lx < x1; lx += 2) {
    for (const dz of [-0.38, 0.38]) conveyor.add(mesh(box(0.06, 0.7, 0.06, lx, 0.35, z + dz), MAT.dark));
  }
  const rollerGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.7, 10);
  rollerGeo.rotateX(Math.PI / 2);
  const rollerCount = Math.floor(len / 0.18);
  const rollers = new THREE.InstancedMesh(rollerGeo, MAT.steel, rollerCount);
  const m = new THREE.Matrix4();
  for (let i = 0; i < rollerCount; i++) rollers.setMatrixAt(i, m.makeTranslation(x0 + 0.09 + i * 0.18, 0.74, z));
  rollers.receiveShadow = true;
  conveyor.add(rollers);
  root.add(conveyor);

  const parcels = [];
  for (let i = 0; i < 6; i++) {
    const s = 0.32 + rng() * 0.18;
    const parcel = mesh(box(s, s * 0.75, s * 0.85), cartonMat);
    parcel.position.set(x0 + (i / 6) * len, 0.79 + (s * 0.75) / 2, z);
    root.add(parcel);
    parcels.push(parcel);
  }
  updaters.push((dt) => {
    for (const parcel of parcels) {
      parcel.position.x += dt * 0.9;
      if (parcel.position.x > x1 - 0.2) parcel.position.x = x0 + 0.2;
    }
  });
}
