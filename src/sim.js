import * as THREE from 'three';
import { createForklift, createPalletUnit, createWorker, seeded } from './scene/props.js';

const SPEED = 3.2;
const REVERSE_SPEED = 2.4;
const FORK_OFFSET = 1.55;
const LIFT_HEIGHT = 0.3;
const LIFT_TIME = 0.8;

const easeInOut = (t) => t * t * (3 - 2 * t);

function curveFrom(points) {
  return new THREE.CatmullRomCurve3(points, false, 'centripetal');
}

// 担当フォークリフトが、ピック位置から出荷待機エリアへパレットを運ぶシミュレーション
export class Operations {
  constructor({ world, tasks }) {
    this.world = world;
    this.tasks = tasks;
    this.initial = tasks.map((t) => ({ ready: t.ready, status: t.status }));
    this.rng = seeded(42);
    this.listeners = {};
    this.tweens = [];

    this.forklift = createForklift('#2563eb');
    this.forklift.group.position.copy(world.home);
    this.yaw = Math.PI;
    world.root.add(this.forklift.group);

    this.picker = createWorker({ tablet: true });
    world.root.add(this.picker);

    this.staging = new THREE.Group();
    world.root.add(this.staging);
    this.slotIndex = 0;

    this.spotPallets = new Map();
    for (const task of tasks) this.ensureSpotPallet(task, false);

    this.current = tasks.find((t) => t.status === 'Preparing') ?? tasks[0];
    for (let i = 0; i < this.current.ready; i++) this.placeStaged(createPalletUnit(this.rng), false);

    this.carried = null;
    this.beginTask(this.current, true);
  }

  on(name, fn) {
    (this.listeners[name] ??= []).push(fn);
  }

  emit(name, payload) {
    for (const fn of this.listeners[name] ?? []) fn(payload);
  }

  spotOf(task) {
    return this.world.spots[task.zone];
  }

  // クリック判定に使う、各タスクのピック対象パレット
  get pickables() {
    return [...this.spotPallets.values()];
  }

  ensureSpotPallet(task, animate = true) {
    if (task.ready >= task.total || this.spotPallets.has(task.id)) return;
    const unit = createPalletUnit(this.rng, task.id.endsWith('5') ? 'wrap' : 'carton');
    unit.position.copy(this.spotOf(task).pos);
    unit.userData.taskId = task.id;
    this.world.root.add(unit);
    this.spotPallets.set(task.id, unit);
    if (animate) this.popIn(unit);
  }

  popIn(object) {
    object.scale.setScalar(0.001);
    this.tween(0.5, (k) => object.scale.setScalar(Math.max(0.001, easeInOut(k))));
  }

  tween(duration, fn, done) {
    this.tweens.push({ t: 0, duration, fn, done });
  }

  beginTask(task, first = false) {
    this.current = task;
    task.status = 'Preparing';
    const spot = this.spotOf(task);
    const end = spot.pos.clone().addScaledVector(spot.front, FORK_OFFSET);
    const pre = spot.pos.clone().addScaledVector(spot.front, 4.5);
    const home = this.world.home;
    const mid = new THREE.Vector3((home.x + pre.x) / 2, 0, (home.z + pre.z) / 2 + 0.6);
    this.route = curveFrom([home.clone(), mid, pre, end]);
    this.routeLength = this.route.getLength();
    this.ensureSpotPallet(task, !first);
    this.walkerTarget = spot.pos.clone().add(new THREE.Vector3(1.35, 0, 0.5));
    if (first) {
      this.picker.position.copy(this.walkerTarget);
      this.yaw = Math.atan2(-spot.front.x, -spot.front.z);
    }
    this.phase = 'toPick';
    this.s = 0;
    this.emit('task', task);
  }

  // 次のタスクへ進む。全部終わったら最初からやり直す
  advance() {
    const next = this.tasks.find((t) => t.status !== 'Staged');
    if (next) {
      this.beginTask(next);
      return;
    }
    this.tasks.forEach((t, i) => {
      t.ready = this.initial[i].ready;
      t.status = this.initial[i].status;
    });
    this.clearStaging();
    for (let i = 0; i < this.tasks[0].ready; i++) this.placeStaged(createPalletUnit(this.rng), true);
    for (const t of this.tasks) this.ensureSpotPallet(t, true);
    this.emit('reset');
    this.beginTask(this.tasks.find((t) => t.status === 'Preparing') ?? this.tasks[0]);
  }

  clearStaging() {
    for (const child of this.staging.children) {
      this.tween(
        0.4,
        (k) => child.scale.setScalar(Math.max(0.001, 1 - k)),
        () => this.staging.remove(child),
      );
    }
    this.slotIndex = 0;
  }

  nextSlot() {
    if (this.slotIndex >= this.world.slots.length) this.clearStaging();
    return this.world.slots[this.slotIndex++];
  }

  placeStaged(unit, animate) {
    const slot = this.nextSlot();
    unit.position.copy(slot);
    unit.rotation.set(0, 0, 0);
    this.staging.add(unit);
    if (animate) this.popIn(unit);
  }

  placeForklift(curve, s) {
    const p = curve.getPointAt(s);
    const t = curve.getTangentAt(s);
    this.forklift.group.position.copy(p);
    this.targetYaw = Math.atan2(t.x, t.z);
  }

  update(dt, time) {
    // ループの途中で this.tweens から要素を外し、done の中で新しい tween を足すため、配列のコピーを回す
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const tw of [...this.tweens]) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.duration);
      tw.fn(k);
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done?.();
      }
    }

    const carriage = this.forklift.carriage;
    switch (this.phase) {
      case 'toPick': {
        this.s = Math.min(1, this.s + (dt * SPEED) / this.routeLength);
        this.placeForklift(this.route, this.s);
        if (this.s >= 1) {
          this.phase = 'lift';
          this.t = 0;
          const unit = this.spotPallets.get(this.current.id);
          if (unit) {
            this.spotPallets.delete(this.current.id);
            carriage.attach(unit);
            this.carried = unit;
          }
          // 残りがあれば、次のパレットをすぐ床に出しておく
          if (this.current.total - this.current.ready > 1) {
            this.tween(
              1.2,
              () => {},
              () => this.ensureSpotPallet(this.current, true),
            );
          }
        }
        break;
      }
      case 'lift': {
        this.t += dt;
        carriage.position.y = LIFT_HEIGHT * easeInOut(Math.min(1, this.t / LIFT_TIME));
        if (this.t >= LIFT_TIME) this.phase = 'back';
        break;
      }
      case 'back': {
        this.s = Math.max(0, this.s - (dt * REVERSE_SPEED) / this.routeLength);
        this.placeForklift(this.route, this.s);
        if (this.s <= 0) {
          const slot = this.nextSlot();
          this.slot = slot;
          const end = slot.clone().add(new THREE.Vector3(0, 0, -FORK_OFFSET));
          const pre = slot.clone().add(new THREE.Vector3(0, 0, -4));
          this.dropRoute = curveFrom([this.world.home.clone(), pre, end]);
          this.dropLength = this.dropRoute.getLength();
          this.phase = 'toSlot';
          this.s = 0;
        }
        break;
      }
      case 'toSlot': {
        this.s = Math.min(1, this.s + (dt * SPEED) / this.dropLength);
        this.placeForklift(this.dropRoute, this.s);
        if (this.s >= 1) {
          this.phase = 'lower';
          this.t = 0;
        }
        break;
      }
      case 'lower': {
        this.t += dt;
        carriage.position.y = LIFT_HEIGHT * (1 - easeInOut(Math.min(1, this.t / LIFT_TIME)));
        if (this.t >= LIFT_TIME) {
          if (this.carried) {
            this.staging.attach(this.carried);
            this.carried.position.copy(this.slot);
            this.carried.rotation.set(0, 0, 0);
            this.carried.userData.taskId = undefined;
            this.carried = null;
          }
          this.current.ready = Math.min(this.current.total, this.current.ready + 1);
          this.emit('progress', this.current);
          this.phase = 'fromSlot';
        }
        break;
      }
      case 'fromSlot': {
        this.s = Math.max(0, this.s - (dt * REVERSE_SPEED) / this.dropLength);
        this.placeForklift(this.dropRoute, this.s);
        if (this.s <= 0) {
          if (this.current.ready < this.current.total) {
            this.ensureSpotPallet(this.current, true);
            this.phase = 'toPick';
          } else {
            this.current.status = 'Staged';
            this.emit('complete', this.current);
            this.phase = 'wait';
            this.t = 3.5;
          }
        }
        break;
      }
      case 'wait': {
        this.t -= dt;
        if (this.t <= 0) this.advance();
        break;
      }
    }

    // 向きはなめらかに追従させる
    if (this.targetYaw !== undefined) {
      let d = this.targetYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 7);
      this.forklift.group.rotation.y = this.yaw;
    }
    this.forklift.beacon.material.emissiveIntensity = 1.2 + Math.sin(time * 8) * 1;

    this.updatePicker(dt, time);
  }

  // ピック担当の作業員は、現在のタスクのパレット横へ歩いて移動する
  updatePicker(dt, time) {
    const p = this.picker.position;
    const to = this.walkerTarget.clone().sub(p);
    to.y = 0;
    const dist = to.length();
    if (dist > 0.05) {
      to.normalize();
      p.addScaledVector(to, Math.min(dist, dt * 1.8));
      p.y = Math.abs(Math.sin(time * 9)) * 0.05;
      this.picker.rotation.y = Math.atan2(to.x, to.z);
    } else {
      p.y = 0;
      const spot = this.spotOf(this.current).pos;
      this.picker.rotation.y = Math.atan2(spot.x - p.x, spot.z - p.z);
    }
  }
}
