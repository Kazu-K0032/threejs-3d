import * as THREE from 'three';
import './style.css';
import sampleUrl from '../sample.jpg';
import { CLOCK_START, KPI, TASKS } from './data.js';
import { HoverTag, RouteRibbon, SelectionMarker } from './scene/markers.js';
import { createStage } from './scene/stage.js';
import { buildWarehouse } from './scene/warehouse.js';
import { Operations } from './sim.js';
import { createUI } from './ui.js';

const container = document.getElementById('viewport');
const stage = createStage(container);
const world = buildWarehouse(stage.scene);
const ops = new Operations({ world, tasks: TASKS });
const route = new RouteRibbon(world.root);
const marker = new SelectionMarker(world.root);
const hoverTag = new HoverTag(world.root);
document.getElementById('ref-image').src = sampleUrl;

// 画面の時計（シミュレーション上の時刻。実時間と同じ速さで進む）
const clockStart = performance.now();
const clockMinutes = () =>
  CLOCK_START.hour * 60 + CLOCK_START.minute + Math.floor((performance.now() - clockStart) / 60000);
const clockText = () => {
  const m = clockMinutes();
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

let selectedId = ops.current.id;
let followActive = true;
let completed = false;

const ui = createUI({
  tasks: TASKS,
  kpi: KPI,
  onSelect: (id, opts) => select(id, opts),
});

function taskById(id) {
  return TASKS.find((t) => t.id === id);
}

function select(id, { focus = false } = {}) {
  const task = taskById(id);
  if (!task) return;
  selectedId = id;
  followActive = task === ops.current;
  ui.renderDetail(task, clockMinutes());
  ui.showDetail(true);
  marker.setTask(task, world.spots[task.zone].pos);
  if (focus) stage.focus(world.spots[task.zone].pos);
}

function refresh() {
  ui.renderBottom(ops.current, completed);
  ui.renderDetail(taskById(selectedId), clockMinutes());
}

ops.on('task', (task) => {
  completed = false;
  route.setCurve(ops.route);
  if (followActive) select(task.id);
  refresh();
});
ops.on('progress', () => {
  KPI.ready += 1;
  KPI.rate = Math.min(99, Math.round((KPI.ready / KPI.readyGoal) * 100));
  ui.renderKpis();
  refresh();
});
ops.on('complete', () => {
  completed = true;
  KPI.pending = Math.max(0, KPI.pending - 1);
  ui.renderKpis();
  refresh();
});
// 全タスクを終えたら、KPI の数値もすべて最初の値へ戻す（件数は、完了のたびに増減するため）
const initialKpi = structuredClone(KPI);
ops.on('reset', () => {
  Object.assign(KPI, initialKpi);
  ui.renderKpis();
});

route.setCurve(ops.route);
ui.renderKpis();
select(selectedId);
refresh();
// 狭い画面では詳細パネルが 3D を覆うので、最初は閉じておく
if (window.innerWidth <= 900) ui.showDetail(false);

// 注文詳細で隠れる分だけ描画をずらして、倉庫の中心を、見える範囲の中央に置く。
// 広い画面では右の詳細パネルの幅の半分だけ左へ、狭い画面では下のシートが隠す分だけ上へずらす
function updateViewShift() {
  const detail = document.getElementById('detail');
  if (!ui.isDetailVisible()) {
    stage.setViewShift(0, 0);
  } else if (window.innerWidth > 900) {
    stage.setViewShift((detail.offsetWidth + 16) / 2, 0);
  } else {
    const visibleTop = document.querySelector('.kpis').getBoundingClientRect().bottom;
    const visibleBottom = window.innerHeight - 12 - detail.offsetHeight;
    stage.setViewShift(0, window.innerHeight / 2 - (visibleTop + visibleBottom) / 2);
  }
}
window.addEventListener('detail-toggle', updateViewShift);
window.addEventListener('resize', updateViewShift);
updateViewShift();

// ---------- パレットのホバーとクリック ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDirty = false;
let downAt = null;
const canvas = stage.renderer.domElement;

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  pointerDirty = true;
});
canvas.addEventListener('pointerleave', () => {
  hovered = null;
  hoverTag.hide();
  canvas.style.cursor = '';
});
canvas.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved < 5 && hovered) select(hovered.id, { focus: true });
});

let hovered = null;
function pickHover() {
  raycaster.setFromCamera(pointer, stage.camera);
  const hit = raycaster.intersectObjects(ops.pickables, true)[0];
  let task = null;
  if (hit) {
    let o = hit.object;
    while (o && !o.userData.taskId) o = o.parent;
    task = o ? taskById(o.userData.taskId) : null;
  }
  hovered = task;
  canvas.style.cursor = task ? 'pointer' : '';
  if (task && task.id !== selectedId) hoverTag.show(task, world.spots[task.zone].pos);
  else hoverTag.hide();
}

// 開発サーバーのときだけ、E2E テストが 3D の位置を画面の座標へ変換できるよう、内部を公開する（ビルドでは取り除かれる）
if (import.meta.env.DEV) window.__app = { stage, world, ops, select };

// ---------- ループ ----------
const clock = new THREE.Clock();
let lastClock = '';
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  world.update(dt, time);
  ops.update(dt, time);
  route.update(dt);
  marker.update(dt, time);
  if (pointerDirty) {
    pickHover();
    pointerDirty = false;
  }
  const text = clockText();
  if (text !== lastClock) {
    lastClock = text;
    ui.setClock(text);
  }
  stage.update(dt);
  stage.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
