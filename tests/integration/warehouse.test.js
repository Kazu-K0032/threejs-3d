import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { TASKS } from '../../src/data.js';
import { FLOOR, buildWarehouse } from '../../src/scene/warehouse.js';

const inFloor = (v, margin = 0) =>
  v.x >= FLOOR.minX - margin && v.x <= FLOOR.maxX + margin && v.z >= FLOOR.minZ - margin && v.z <= FLOOR.maxZ + margin;

function minimumDistance(points) {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) min = Math.min(min, points[i].distanceTo(points[j]));
  }
  return min;
}

describe('倉庫（実物の部品を組み合わせたもの）', () => {
  let scene;
  let world;

  beforeAll(() => {
    scene = new THREE.Scene();
    world = buildWarehouse(scene);
  });

  it('データの全タスクのゾーンに、ピック位置がある（データと 3D の取り決め）', () => {
    for (const task of TASKS) {
      const spot = world.spots[task.zone];
      expect(spot, `${task.zone} のピック位置が無い`).toBeDefined();
      expect(spot.pos.toArray().every(Number.isFinite)).toBe(true);
      expect(spot.front.length()).toBeCloseTo(1);
    }
  });

  it('ピック位置は床の中にあり、互いに 3 m 以上離れている', () => {
    const positions = Object.values(world.spots).map((s) => s.pos);
    for (const pos of positions) expect(inFloor(pos)).toBe(true);
    expect(minimumDistance(positions)).toBeGreaterThanOrEqual(3);
  });

  it('出荷待機の置き場は 20 枠で、床の中にあり、パレットが重ならない', () => {
    expect(world.slots).toHaveLength(20);
    for (const slot of world.slots) expect(inFloor(slot)).toBe(true);
    // パレットの幅（1.2 m）より広い間隔である
    expect(minimumDistance(world.slots)).toBeGreaterThan(1.2);
  });

  it('フォークリフトの出発点は、床の中にある', () => {
    expect(inFloor(world.home)).toBe(true);
  });

  it('倉庫の部品がシーンに追加される', () => {
    expect(scene.children).toContain(world.root);
    let meshes = 0;
    scene.traverse((o) => {
      if (o.isMesh) meshes++;
    });
    expect(meshes).toBeGreaterThan(100);
  });

  it('動かし続けても例外が出ず、すべての部品の位置が有限の値のままである', () => {
    const fresh = new THREE.Scene();
    const warehouse = buildWarehouse(fresh);
    for (let i = 0; i < 600; i++) warehouse.update(1 / 30, i / 30);
    fresh.updateMatrixWorld(true);
    let broken = 0;
    fresh.traverse((o) => {
      if (!o.matrixWorld.elements.every(Number.isFinite)) broken++;
    });
    expect(broken).toBe(0);
  });
});
