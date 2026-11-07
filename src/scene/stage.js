import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CAMERA_YAW, FLOOR } from './warehouse.js';

// 画面の縦方向に映すワールドの長さ
const VIEW_HEIGHT = 37;
const CAMERA_OFFSET = new THREE.Vector3(Math.sin(CAMERA_YAW), 0, Math.cos(CAMERA_YAW)).multiplyScalar(70).setY(66);

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e7ecf4');

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(4.5, 0, 5);
  camera.position.copy(controls.target).add(CAMERA_OFFSET);
  camera.zoom = 1;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.minZoom = 0.7;
  controls.maxZoom = 3;
  controls.minPolarAngle = 0.45;
  controls.maxPolarAngle = 1.1;
  controls.minAzimuthAngle = CAMERA_YAW - 0.7;
  controls.maxAzimuthAngle = CAMERA_YAW + 0.7;
  controls.update();

  // パンしても倉庫の外へ注視点が出ないようにする
  const clampTarget = () => {
    const t = controls.target;
    const cx = THREE.MathUtils.clamp(t.x, FLOOR.minX + 4, FLOOR.maxX - 4);
    const cz = THREE.MathUtils.clamp(t.z, FLOOR.minZ + 3, FLOOR.maxZ - 3);
    if (cx !== t.x || cz !== t.z || t.y !== 0) {
      const delta = new THREE.Vector3(cx - t.x, -t.y, cz - t.z);
      t.add(delta);
      camera.position.add(delta);
    }
  };
  controls.addEventListener('change', clampTarget);

  // 光
  scene.add(new THREE.HemisphereLight('#ffffff', '#c3cede', 1.5));
  const sun = new THREE.DirectionalLight('#ffffff', 2.4);
  sun.position.set(18, 40, 22);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -32;
  sc.right = 32;
  sc.top = 28;
  sc.bottom = -28;
  sc.near = 1;
  sc.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // 右の詳細パネルで隠れる分だけ描画の中心をずらす
  const viewShift = { x: 0, y: 0 };
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const aspect = w / h;
    const viewH = aspect < 1 ? VIEW_HEIGHT * 1.5 : VIEW_HEIGHT;
    camera.left = (-viewH * aspect) / 2;
    camera.right = (viewH * aspect) / 2;
    camera.top = viewH / 2;
    camera.bottom = -viewH / 2;
    camera.setViewOffset(w, h, viewShift.x, viewShift.y, w, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  function setViewShift(x, y) {
    viewShift.x = x;
    viewShift.y = y;
    resize();
  }

  // 注視点をなめらかに移動する。ユーザーが操作したら中断する
  let focusTarget = null;
  controls.addEventListener('start', () => {
    focusTarget = null;
  });
  function focus(point) {
    focusTarget = new THREE.Vector3(point.x, 0, point.z);
  }

  function update(dt) {
    if (focusTarget) {
      const delta = focusTarget.clone().sub(controls.target);
      if (delta.lengthSq() < 0.0004) {
        focusTarget = null;
      } else {
        delta.multiplyScalar(Math.min(1, dt * 4));
        controls.target.add(delta);
        camera.position.add(delta);
      }
    }
    controls.update();
  }

  function render() {
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  return { renderer, scene, camera, controls, update, render, focus, setViewShift, resize };
}
