import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HoverTag, RouteRibbon, SelectionMarker } from '../../src/scene/markers.js';
import { cloneTasks } from '../helpers/fixtures.js';

const straightCurve = (length = 10) =>
  new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(length / 2, 0, 0),
    new THREE.Vector3(length, 0, 0),
  ]);

describe('RouteRibbon', () => {
  it('曲線の長さを 0.2 m ごとに区切り、左右 2 頂点ずつの帯を作る', () => {
    const ribbon = new RouteRibbon(new THREE.Group());
    ribbon.setCurve(straightCurve(10));
    const { geometry } = ribbon.mesh;
    expect(geometry.attributes.position.count).toBe((50 + 1) * 2);
    expect(geometry.index.count).toBe(50 * 6);
  });

  it('帯の幅は 0.75 m で、床（y = 0）に沿う', () => {
    const ribbon = new RouteRibbon(new THREE.Group());
    ribbon.setCurve(straightCurve(10));
    const position = ribbon.mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i += 2) {
      const left = new THREE.Vector3().fromBufferAttribute(position, i);
      const right = new THREE.Vector3().fromBufferAttribute(position, i + 1);
      expect(left.distanceTo(right)).toBeCloseTo(0.75, 5);
      expect(left.y).toBe(0);
      expect(right.y).toBe(0);
    }
  });

  it('模様の繰り返しは、1.6 m ごとである', () => {
    const ribbon = new RouteRibbon(new THREE.Group());
    ribbon.setCurve(straightCurve(10));
    const uv = ribbon.mesh.geometry.attributes.uv;
    expect(uv.getX(uv.count - 1)).toBeCloseTo(10 / 1.6, 5);
  });

  it('曲線を差し替えると、形状も差し替わる', () => {
    const ribbon = new RouteRibbon(new THREE.Group());
    ribbon.setCurve(straightCurve(10));
    const first = ribbon.mesh.geometry;
    ribbon.setCurve(straightCurve(4));
    expect(ribbon.mesh.geometry).not.toBe(first);
    expect(ribbon.mesh.geometry.attributes.position.count).toBe((20 + 1) * 2);
  });

  it('update のたびに、模様が流れる', () => {
    const ribbon = new RouteRibbon(new THREE.Group());
    ribbon.update(1);
    expect(ribbon.texture.offset.x).toBeCloseTo(-0.9);
  });

  it('作った帯は、親に追加される', () => {
    const parent = new THREE.Group();
    const ribbon = new RouteRibbon(parent);
    expect(parent.children).toContain(ribbon.mesh);
  });
});

describe('SelectionMarker', () => {
  const [task, other] = cloneTasks();

  it('ラベルに、タスクの id とゾーンを出す', () => {
    const marker = new SelectionMarker(new THREE.Group());
    marker.setTask(task, new THREE.Vector3(1, 0, 2));
    expect(marker.el.querySelector('b').textContent).toBe(task.id);
    expect(marker.el.querySelector('small').textContent).toBe(task.zone);
  });

  it('最初の選択では、その位置にすぐ現れる', () => {
    const marker = new SelectionMarker(new THREE.Group());
    marker.setTask(task, new THREE.Vector3(1, 0, 2));
    expect(marker.group.position.toArray()).toEqual([1, 0, 2]);
    expect(marker.group.visible).toBe(true);
  });

  it('2 回目以降は、すぐには動かず、update で目標へ近づく', () => {
    const marker = new SelectionMarker(new THREE.Group());
    marker.setTask(task, new THREE.Vector3(1, 0, 2));
    marker.setTask(other, new THREE.Vector3(9, 0, -4));
    expect(marker.group.position.toArray()).toEqual([1, 0, 2]);
    marker.update(1, 0);
    expect(marker.group.position.toArray()).toEqual([9, 0, -4]);
  });

  it('四隅の枠が、時間とともに脈打つ', () => {
    const marker = new SelectionMarker(new THREE.Group());
    const base = marker.corners[0].userData.base.clone();
    marker.update(0, 0);
    expect(marker.corners[0].position.x).toBeCloseTo(base.x);
    marker.update(0, Math.PI / 2 / 3.2);
    expect(marker.corners[0].position.x).toBeCloseTo(base.x * 1.07);
    expect(marker.corners).toHaveLength(4);
  });
});

describe('HoverTag', () => {
  const [task] = cloneTasks();

  it('最初は非表示である', () => {
    expect(new HoverTag(new THREE.Group()).object.visible).toBe(false);
  });

  it('show で、id と「ゾーン · 状態」を出し、パレットの真上（高さ 2.1）に置く', () => {
    const tag = new HoverTag(new THREE.Group());
    tag.show(task, new THREE.Vector3(3, 0, -5));
    expect(tag.object.visible).toBe(true);
    expect(tag.el.querySelector('b').textContent).toBe(task.id);
    expect(tag.el.querySelector('small').textContent).toBe(`${task.zone} · ${task.status}`);
    expect(tag.object.position.toArray()).toEqual([3, 2.1, -5]);
  });

  it('hide で非表示に戻る', () => {
    const tag = new HoverTag(new THREE.Group());
    tag.show(task, new THREE.Vector3());
    tag.hide();
    expect(tag.object.visible).toBe(false);
  });
});
