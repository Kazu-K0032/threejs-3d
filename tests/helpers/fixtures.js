import * as THREE from 'three';
import { KPI, TASKS } from '../../src/data.js';

// シミュレーションがタスクの値を書き換えるため、テストごとに複製を使う
export const cloneTasks = () => structuredClone(TASKS);
export const cloneKpi = () => structuredClone(KPI);

// 実物の倉庫を作らず、Operations が使う形（root・spots・slots・home）だけを持つ世界。
// ピック位置はタスクごとに 6 m ずつ離し、出荷待機の置き場は 4 行 × 5 列の 20 枠にする
export function createStubWorld(tasks = cloneTasks()) {
  const spots = {};
  tasks.forEach((task, i) => {
    spots[task.zone] = {
      pos: new THREE.Vector3(-6 + i * 6, 0, -4),
      front: new THREE.Vector3(0, 0, 1),
    };
  });
  const slots = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) slots.push(new THREE.Vector3(11 + col * 1.9, 0, 7.5 + row * 1.7));
  }
  return { root: new THREE.Group(), spots, slots, home: new THREE.Vector3(8, 0, 3.8) };
}

// update を一定の刻みで進め、条件を満たしたら止める。条件を満たさないまま上限に達したら例外にする
export function runUntil(operations, condition, { dt = 0.05, maxSeconds = 600 } = {}) {
  let time = 0;
  while (!condition()) {
    if (time > maxSeconds) throw new Error(`${maxSeconds} 秒進めても条件を満たさなかった（phase=${operations.phase}）`);
    time += dt;
    operations.update(dt, time);
  }
  return time;
}
