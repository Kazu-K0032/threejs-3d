import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  Batch,
  PALLET,
  box,
  createBollard,
  createBush,
  createForklift,
  createPalletUnit,
  createRack,
  createRail,
  createWorker,
  loadLayout,
  mesh,
  seeded,
} from '../../src/scene/props.js';

const take = (rng, count) => Array.from({ length: count }, () => rng());

describe('seeded', () => {
  it('同じ種からは、同じ列が出る', () => {
    expect(take(seeded(7), 10)).toEqual(take(seeded(7), 10));
  });

  it('違う種からは、違う列が出る', () => {
    expect(take(seeded(7), 10)).not.toEqual(take(seeded(8), 10));
  });

  it('値は 0 以上 1 未満で、偏りが小さい', () => {
    const values = take(seeded(1), 2000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe('box / mesh', () => {
  it('box は、指定した位置に寸法どおりの箱を作る', () => {
    const geometry = box(2, 4, 6, 1, 2, 3);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    expect(size.toArray()).toEqual([2, 4, 6]);
    expect(center.toArray()).toEqual([1, 2, 3]);
  });

  it('mesh は、既定で影を落とし、受ける', () => {
    const m = mesh(box(1, 1, 1), new THREE.MeshBasicMaterial());
    expect(m.castShadow).toBe(true);
    expect(m.receiveShadow).toBe(true);
  });

  it('mesh は、指定すれば影を落とさない', () => {
    const m = mesh(box(1, 1, 1), new THREE.MeshBasicMaterial(), { cast: false, receive: false });
    expect(m.castShadow).toBe(false);
    expect(m.receiveShadow).toBe(false);
  });
});

describe('loadLayout', () => {
  it('段ボールは 9 個以上 27 個以下で、すべてパレットの上面より上に載る', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const items = loadLayout(seeded(seed), 'carton');
      expect(items.length).toBeGreaterThanOrEqual(9);
      expect(items.length).toBeLessThanOrEqual(27);
      for (const item of items) {
        expect(item.kind).toBe('carton');
        expect(item.p[1] - item.s[1] / 2).toBeGreaterThanOrEqual(PALLET.top - 1e-9);
      }
    }
  });

  it('段ボールは、パレットの底面からはみ出さない', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const item of loadLayout(seeded(seed), 'carton')) {
        expect(Math.abs(item.p[0]) + item.s[0] / 2).toBeLessThanOrEqual(PALLET.width / 2);
        expect(Math.abs(item.p[2]) + item.s[2] / 2).toBeLessThanOrEqual(PALLET.depth / 2);
      }
    }
  });

  it('フィルム巻きは 1 個のかたまりで、パレットの上に載る', () => {
    const items = loadLayout(seeded(3), 'wrap');
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('wrap');
    expect(items[0].p[1] - items[0].s[1] / 2).toBeCloseTo(PALLET.top);
  });

  it('同じ種からは、同じ並びになる', () => {
    const describeItems = (items) => items.map((i) => ({ kind: i.kind, p: i.p, s: i.s, c: i.c.getHex() }));
    expect(describeItems(loadLayout(seeded(5), 'carton'))).toEqual(describeItems(loadLayout(seeded(5), 'carton')));
  });
});

describe('Batch', () => {
  it('積んだパレットと箱の数だけ、InstancedMesh の個数が決まる', () => {
    const batch = new Batch();
    const rng = seeded(11);
    const expected = seeded(11);
    const cartonCounts = [];
    for (const style of ['carton', 'carton', 'wrap']) {
      batch.addLoad(new THREE.Matrix4(), rng, style);
      cartonCounts.push({ style, count: loadLayout(expected, style).length });
    }

    const parent = new THREE.Group();
    const meshes = batch.build(parent);
    expect(meshes.every((m) => m instanceof THREE.InstancedMesh)).toBe(true);
    expect(parent.children).toHaveLength(meshes.length);

    const counts = meshes.map((m) => m.count);
    expect(counts[0]).toBe(3);
    const cartons = cartonCounts.filter((c) => c.style === 'carton').reduce((sum, c) => sum + c.count, 0);
    const wraps = cartonCounts.filter((c) => c.style === 'wrap').reduce((sum, c) => sum + c.count, 0);
    expect(counts).toEqual([3, cartons, wraps]);
  });

  it('荷物が無いときは、何も追加しない', () => {
    const parent = new THREE.Group();
    expect(new Batch().build(parent)).toEqual([]);
    expect(parent.children).toHaveLength(0);
  });

  it('作った InstancedMesh は、影を落とし、受ける', () => {
    const batch = new Batch();
    batch.addLoad(new THREE.Matrix4(), seeded(1));
    for (const m of batch.build(new THREE.Group())) {
      expect(m.castShadow).toBe(true);
      expect(m.receiveShadow).toBe(true);
    }
  });
});

describe('createPalletUnit', () => {
  it('パレット 1 枚と荷物の InstancedMesh を持つグループを返す', () => {
    const unit = createPalletUnit(seeded(2), 'carton');
    expect(unit).toBeInstanceOf(THREE.Group);
    expect(unit.children.length).toBeGreaterThanOrEqual(2);
    expect(unit.children[0].count).toBe(1);
  });

  it('フィルム巻きでは、荷物が 1 個になる', () => {
    const unit = createPalletUnit(seeded(2), 'wrap');
    expect(unit.children.map((m) => m.count)).toEqual([1, 1]);
  });
});

describe('createRack', () => {
  it('乱数を渡さなければ、棚の置き場がすべて埋まる（段数 + 1 の高さ × 2 列 × 区画）', () => {
    const rack = createRack({ bays: 5, levels: 2 });
    expect(rack.slots).toHaveLength(5 * (2 + 1) * 2);
  });

  it('乱数を渡すと、置き場の一部が空く', () => {
    const rack = createRack({ bays: 5, levels: 2, rng: seeded(1) });
    expect(rack.slots.length).toBeLessThan(30);
    expect(rack.slots.length).toBeGreaterThan(20);
  });

  it('全長と高さは、区画数と段数から決まる', () => {
    const rack = createRack({ bays: 4, levels: 2, bayW: 2.8, levelH: 1.6 });
    expect(rack.length).toBeCloseTo(4 * 2.8);
    expect(rack.height).toBeCloseTo(2 * 1.6 + 0.45);
  });

  it('置き場は、棚の奥行きの中央にあり、1 段目は床に置く', () => {
    const rack = createRack({ bays: 2, levels: 2, depth: 1.1 });
    for (const slot of rack.slots) expect(slot.z).toBeCloseTo(-0.55);
    expect(Math.min(...rack.slots.map((s) => s.y))).toBe(0);
  });

  it('ラベルを渡したときだけ、看板を作る', () => {
    expect(createRack({ label: 'A1' }).sign).not.toBeNull();
    expect(createRack({}).sign).toBeNull();
  });
});

describe('createForklift', () => {
  it('フォークの台とビーコンを持ち、台はグループの子である', () => {
    const forklift = createForklift();
    expect(forklift.carriage.parent).toBe(forklift.group);
    expect(forklift.beacon.material.emissiveIntensity).toBeGreaterThan(0);
  });
});

describe('createWorker', () => {
  it('座っている作業員には脚が無い', () => {
    const standing = createWorker({});
    const seated = createWorker({ seated: true });
    expect(standing.children.length - seated.children.length).toBe(2);
  });

  it('タブレットを持つと、画面の部品が増える', () => {
    expect(createWorker({ tablet: true }).children.length).toBe(createWorker({}).children.length + 1);
  });
});

describe('小物', () => {
  it('createBollard は、柱と帯の 2 つの部品を持つ', () => {
    expect(createBollard().children).toHaveLength(2);
  });

  it('createRail は、まとめた 1 つの部品を返す', () => {
    expect(createRail(0, 0, 10, 0).children).toHaveLength(1);
  });

  it('createBush は、3〜5 個の葉のかたまりを持つ', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const count = createBush(seeded(seed)).children.length;
      expect(count).toBeGreaterThanOrEqual(3);
      expect(count).toBeLessThanOrEqual(5);
    }
  });
});
