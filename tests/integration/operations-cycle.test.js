import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Operations } from '../../src/sim.js';
import { FLOOR, buildWarehouse } from '../../src/scene/warehouse.js';
import { cloneTasks, runUntil } from '../helpers/fixtures.js';

const MARGIN = 2;

function setup() {
  const tasks = cloneTasks();
  const initial = structuredClone(tasks);
  const world = buildWarehouse(new THREE.Scene());
  const operations = new Operations({ world, tasks });
  const events = [];
  for (const name of ['task', 'progress', 'complete', 'reset']) {
    operations.on(name, (payload) => events.push(payload?.id ? `${name}:${payload.id}` : name));
  }
  return { tasks, initial, world, operations, events };
}

describe('実物の倉庫での運搬サイクル', () => {
  it('全タスクを 1 周すると、不足分だけ運んで完了し、最初の状態へ戻る', () => {
    const { tasks, initial, operations, events } = setup();
    const seconds = runUntil(operations, () => events.includes('reset'), { maxSeconds: 1500 });

    const expected = [];
    tasks.forEach((task, index) => {
      if (index > 0) expected.push(`task:${task.id}`);
      for (let n = initial[index].ready; n < task.total; n++) expected.push(`progress:${task.id}`);
      expected.push(`complete:${task.id}`);
    });
    expected.push('reset', `task:${tasks[0].id}`);
    expect(events).toEqual(expected);

    tasks.forEach((task, index) => {
      expect(task.ready).toBe(initial[index].ready);
      expect(task.status).toBe(initial[index].status);
    });
    // 止まっていない（遅すぎず、速すぎない）ことの目安
    expect(seconds).toBeGreaterThan(100);
    expect(seconds).toBeLessThan(1000);
  });

  it('フォークリフトは、1 周する間ずっと床の近くを走る', () => {
    const { operations, events, world } = setup();
    let time = 0;
    let outside = 0;
    while (!events.includes('reset')) {
      time += 0.1;
      operations.update(0.1, time);
      const p = operations.forklift.group.position;
      const inside =
        p.x >= FLOOR.minX - MARGIN &&
        p.x <= FLOOR.maxX + MARGIN &&
        p.z >= FLOOR.minZ - MARGIN &&
        p.z <= FLOOR.maxZ + MARGIN;
      if (!inside) outside++;
      world.update(0.1, time);
      if (time > 1500) throw new Error('1 周が終わらなかった');
    }
    expect(outside).toBe(0);
  });

  it('運んだパレットは、出荷待機の置き場の位置に載る', () => {
    const { operations, world, events } = setup();
    runUntil(operations, () => events.some((e) => e.startsWith('progress')));
    const placed = operations.staging.children.at(-1);
    const slot = world.slots[operations.slotIndex - 1];
    expect(placed.position.distanceTo(slot)).toBeLessThan(1e-6);
  });
});
