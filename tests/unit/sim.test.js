import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Operations } from '../../src/sim.js';
import { cloneTasks, createStubWorld, runUntil } from '../helpers/fixtures.js';

const EVENTS = ['task', 'progress', 'complete', 'reset'];

// Operations を作り、コンストラクタの後に出るイベントを順に記録する
function setup(tasks = cloneTasks(), world = createStubWorld(tasks)) {
  const operations = new Operations({ world, tasks });
  const events = [];
  for (const name of EVENTS) operations.on(name, (payload) => events.push({ name, id: payload?.id }));
  const count = (name) => events.filter((e) => e.name === name).length;
  return { operations, tasks, world, events, count };
}

// 1 件だけのタスクで、残り 1 パレットまで進めた状態を作る
function singleTask() {
  const tasks = cloneTasks().slice(0, 1);
  tasks[0].ready = tasks[0].total - 1;
  return tasks;
}

describe('初期状態', () => {
  it('進行中のタスクが current になり、準備済みの数だけ出荷待機に並ぶ', () => {
    const { operations, tasks } = setup();
    expect(operations.current).toBe(tasks[0]);
    expect(operations.staging.children).toHaveLength(tasks[0].ready);
    expect(operations.phase).toBe('toPick');
  });

  it('ピック用のパレットは、未完了のタスクごとにピック位置へ置かれる', () => {
    const { operations, tasks, world } = setup();
    expect(operations.pickables.map((p) => p.userData.taskId).sort()).toEqual(tasks.map((t) => t.id).sort());
    for (const unit of operations.pickables) {
      const task = tasks.find((t) => t.id === unit.userData.taskId);
      expect(unit.position.distanceTo(world.spots[task.zone].pos)).toBe(0);
    }
  });

  it('準備済みのタスクには、ピック用のパレットを置かない', () => {
    const tasks = cloneTasks();
    tasks[1].ready = tasks[1].total;
    const { operations } = setup(tasks);
    expect(operations.pickables.map((p) => p.userData.taskId)).not.toContain(tasks[1].id);
  });

  it('作業員は、進行中のタスクのピック位置の横から始まる', () => {
    const { operations } = setup();
    expect(operations.picker.position.distanceTo(operations.walkerTarget)).toBe(0);
  });
});

describe('イベント', () => {
  it('on で登録した関数は、emit のたびに、登録順に呼ばれる', () => {
    const { operations } = setup();
    const calls = [];
    operations.on('custom', (v) => calls.push(`a${v}`));
    operations.on('custom', (v) => calls.push(`b${v}`));
    operations.emit('custom', 1);
    operations.emit('custom', 2);
    expect(calls).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('登録の無いイベントを emit しても、何も起きない', () => {
    const { operations } = setup();
    expect(() => operations.emit('nothing', 1)).not.toThrow();
  });
});

describe('運搬', () => {
  it('1 回の運搬で progress が 1 回出て、準備済みが 1 増え、出荷待機に 1 枚増える', () => {
    const { operations, tasks, events } = setup();
    const before = tasks[0].ready;
    runUntil(operations, () => events.some((e) => e.name === 'progress'));
    expect(events).toEqual([{ name: 'progress', id: tasks[0].id }]);
    expect(tasks[0].ready).toBe(before + 1);
    expect(operations.staging.children).toHaveLength(before + 1);
  });

  it('運んだパレットは、出荷待機の置き場に載り、ピック対象ではなくなる', () => {
    const { operations, world, events } = setup();
    runUntil(operations, () => events.some((e) => e.name === 'progress'));
    const placed = operations.staging.children.at(-1);
    expect(placed.position.distanceTo(world.slots[operations.slotIndex - 1])).toBeLessThan(1e-6);
    expect(placed.userData.taskId).toBeUndefined();
    expect(operations.pickables).not.toContain(placed);
  });

  it('運んだ後に、同じタスクの次のパレットがピック位置へ戻る', () => {
    const { operations, tasks, events } = setup();
    runUntil(operations, () => events.some((e) => e.name === 'progress'));
    runUntil(operations, () => operations.phase === 'toPick');
    runUntil(operations, () => operations.pickables.some((p) => p.userData.taskId === tasks[0].id), { dt: 0.05 });
    expect(operations.pickables.filter((p) => p.userData.taskId === tasks[0].id)).toHaveLength(1);
  });

  it('動いている間、フォークリフトと作業員の位置・向きは有限の値である', () => {
    const { operations } = setup();
    let time = 0;
    for (let i = 0; i < 800; i++) {
      time += 0.05;
      operations.update(0.05, time);
      const { position, rotation } = operations.forklift.group;
      expect([position.x, position.y, position.z, rotation.y].every(Number.isFinite)).toBe(true);
      const picker = operations.picker.position;
      expect([picker.x, picker.y, picker.z].every(Number.isFinite)).toBe(true);
    }
  });

  it('荷を上げる高さは、0 から 0.3 の間に収まる', () => {
    const { operations } = setup();
    let time = 0;
    for (let i = 0; i < 1200; i++) {
      time += 0.05;
      operations.update(0.05, time);
      const y = operations.forklift.carriage.position.y;
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });
});

describe('タスクの完了と切り替え', () => {
  it('最後のパレットを運ぶと、ready が total になり、Staged になって complete が出る', () => {
    const tasks = singleTask();
    const { operations, events } = setup(tasks);
    runUntil(operations, () => events.some((e) => e.name === 'complete'));
    expect(events.map((e) => e.name)).toEqual(['progress', 'complete']);
    expect(tasks[0].ready).toBe(tasks[0].total);
    expect(tasks[0].status).toBe('Staged');
  });

  it('ready は total を超えない', () => {
    const tasks = singleTask();
    const { operations } = setup(tasks);
    runUntil(operations, () => tasks[0].status === 'Staged');
    runUntil(operations, () => operations.phase === 'wait');
    expect(tasks[0].ready).toBeLessThanOrEqual(tasks[0].total);
  });

  it('完了から 3.5 秒待って、次のタスクを始める', () => {
    const tasks = cloneTasks().slice(0, 2);
    tasks[0].ready = tasks[0].total - 1;
    const { operations, events } = setup(tasks);
    runUntil(operations, () => events.some((e) => e.name === 'complete'));
    const waited = runUntil(operations, () => events.some((e) => e.name === 'task'));
    expect(waited).toBeGreaterThanOrEqual(3.45);
    expect(waited).toBeLessThan(4.5);
    expect(events.at(-1)).toEqual({ name: 'task', id: tasks[1].id });
    expect(operations.current).toBe(tasks[1]);
    expect(tasks[1].status).toBe('Preparing');
  });

  it('すべて終えたら reset を出し、タスクを初期の状態に戻して最初から始める', () => {
    const tasks = singleTask();
    const initial = structuredClone(tasks);
    const { operations, events } = setup(tasks);
    runUntil(operations, () => events.some((e) => e.name === 'reset'));
    expect(tasks[0].ready).toBe(initial[0].ready);
    expect(tasks[0].status).toBe(initial[0].status);
    expect(events.map((e) => e.name)).toEqual(['progress', 'complete', 'reset', 'task']);
    expect(operations.current).toBe(tasks[0]);
    expect(operations.phase).toBe('toPick');
  });

  it('reset の後、ピック用のパレットが戻る', () => {
    const tasks = singleTask();
    const { operations, events } = setup(tasks);
    expect(operations.pickables).toHaveLength(1);
    runUntil(operations, () => events.some((e) => e.name === 'complete'));
    expect(operations.pickables).toHaveLength(0);
    runUntil(operations, () => events.some((e) => e.name === 'reset'));
    expect(operations.pickables).toHaveLength(1);
  });
});

describe('出荷待機の置き場', () => {
  it('置き場が足りなくなったら、並べ直す（古い荷は消える）', () => {
    const tasks = cloneTasks();
    const world = createStubWorld(tasks);
    world.slots.splice(2);
    const { operations } = setup(tasks, world);
    expect(operations.slotIndex).toBe(1);
    expect(operations.staging.children).toHaveLength(3);
    operations.update(0.5, 0);
    expect(operations.staging.children).toHaveLength(1);
  });
});

describe('popIn', () => {
  it('ほぼ 0 の大きさから始まり、0.5 秒で元の大きさになる', () => {
    const { operations } = setup();
    const object = new THREE.Object3D();
    operations.popIn(object);
    expect(object.scale.x).toBeCloseTo(0.001);
    operations.update(0.6, 0);
    expect(object.scale.x).toBeCloseTo(1);
  });
});
