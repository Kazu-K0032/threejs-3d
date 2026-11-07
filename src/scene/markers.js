import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { glowTexture, routeTexture } from './textures.js';

const ROUTE_WIDTH = 0.75;
const ROUTE_TILE = 1.6;

// 床に描くフォークリフトの経路
export class RouteRibbon {
  constructor(parent) {
    this.texture = routeTexture();
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.position.y = 0.02;
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
  }

  setCurve(curve) {
    const length = curve.getLength();
    const n = Math.max(2, Math.ceil(length / 0.2));
    const positions = [];
    const uvs = [];
    const indices = [];
    const side = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      side.set(t.z, 0, -t.x).normalize().multiplyScalar(ROUTE_WIDTH / 2);
      positions.push(p.x + side.x, 0, p.z + side.z, p.x - side.x, 0, p.z - side.z);
      const v = (u * length) / ROUTE_TILE;
      uvs.push(v, 1, v, 0);
      if (i < n) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }

  update(dt) {
    this.texture.offset.x -= dt * 0.9;
  }
}

function tagElement(className) {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = `
    <span class="tag-icon"><svg viewBox="0 0 24 24"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/></svg></span>
    <span class="tag-text"><b></b><small></small></span>`;
  return el;
}

// 選択中のパレットを囲む四隅の枠とラベル
export class SelectionMarker {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    const mat = new THREE.MeshBasicMaterial({ color: '#2f7bff', toneMapped: false });
    const L = 0.55;
    const T = 0.09;
    const hw = 0.95;
    const hd = 0.85;
    this.corners = [];
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const corner = new THREE.Group();
      const a = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, T), mat);
      a.position.set((-sx * L) / 2, 0.03, 0);
      const b = new THREE.Mesh(new THREE.BoxGeometry(T, 0.06, L), mat);
      b.position.set(0, 0.03, (-sz * L) / 2);
      const post = new THREE.Mesh(new THREE.BoxGeometry(T, 0.55, T), mat);
      post.position.set(0, 0.275, 0);
      corner.add(a, b, post);
      corner.position.set(sx * hw, 0.01, sz * hd);
      corner.userData.base = corner.position.clone();
      this.group.add(corner);
      this.corners.push(corner);
    }
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.0),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#3b82f6', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.015;
    this.glow.renderOrder = 1;
    this.group.add(this.glow);

    this.light = new THREE.PointLight('#5b9bff', 6, 4, 1.6);
    this.light.position.y = 1.2;
    this.group.add(this.light);

    this.el = tagElement('tag tag-selected');
    this.label = new CSS2DObject(this.el);
    this.label.position.set(0, 2.5, 0);
    this.group.add(this.label);
    this.target = null;
  }

  setTask(task, position) {
    this.el.querySelector('b').textContent = task.id;
    this.el.querySelector('small').textContent = task.zone;
    this.target = position.clone();
    if (!this.group.visible || this.group.position.lengthSq() === 0) this.group.position.copy(position);
    this.group.visible = true;
  }

  update(dt, time) {
    if (this.target) this.group.position.lerp(this.target, Math.min(1, dt * 6));
    const pulse = 1 + Math.sin(time * 3.2) * 0.07;
    for (const c of this.corners) {
      c.position.x = c.userData.base.x * pulse;
      c.position.z = c.userData.base.z * pulse;
    }
    this.glow.material.opacity = 0.4 + Math.sin(time * 3.2) * 0.15;
  }
}

// カーソルを重ねたパレットに出す小さなラベル
export class HoverTag {
  constructor(parent) {
    this.el = tagElement('tag tag-hover');
    this.object = new CSS2DObject(this.el);
    this.object.visible = false;
    parent.add(this.object);
  }

  show(task, position) {
    this.el.querySelector('b').textContent = task.id;
    this.el.querySelector('small').textContent = `${task.zone} · ${task.status}`;
    this.object.position.set(position.x, 2.1, position.z);
    this.object.visible = true;
  }

  hide() {
    this.object.visible = false;
  }
}
