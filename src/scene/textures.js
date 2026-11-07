import * as THREE from 'three';

const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// 段ボール。色は InstancedMesh のインスタンスカラーで乗算するので白地で描く
export function cardboardTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.07)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(150,100,40,0.22)';
    ctx.fillRect(w * 0.44, 0, w * 0.12, h);
    ctx.strokeStyle = 'rgba(90,60,20,0.28)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  });
}

// ストレッチフィルムで巻いた荷姿
export function wrapTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,140,170,0.18)';
    ctx.lineWidth = 2;
    for (let y = 8; y < h; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + 6);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(80,100,130,0.25)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  });
}

// 床のタイル目地
export function floorTexture() {
  const texture = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,140,170,0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, w, h);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// 床に描く文字。返り値の aspect で平面の縦横比を決める
export function textDecal(lines, { color = 'rgba(64,84,122,0.5)', px = 120, weight = 800 } = {}) {
  const list = Array.isArray(lines) ? lines : [lines];
  const font = `${weight} ${px}px ${FONT}`;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  measure.letterSpacing = `${px * 0.08}px`;
  const textWidth = Math.max(...list.map((line) => measure.measureText(line).width));
  const width = Math.ceil(textWidth + px * 0.6);
  const lineHeight = px * 1.1;
  const height = Math.ceil(list.length * lineHeight + px * 0.3);
  const texture = canvasTexture(width, height, (ctx) => {
    ctx.font = font;
    ctx.letterSpacing = `${px * 0.08}px`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    list.forEach((line, i) => ctx.fillText(line, width / 2, px * 0.15 + lineHeight * (i + 0.5)));
  });
  return { texture, aspect: width / height };
}

// ラック上部の看板（A1 など）
export function signTexture(text, bg = '#1d5bd8') {
  return canvasTexture(256, 200, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(6, 6, w - 12, h - 12, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.roundRect(20, 20, w - 40, h - 40, 16);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 112px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 6);
  });
}

// フォークリフト経路の帯。u 方向へ繰り返し、offset を動かして矢印を流す
export function routeTexture() {
  const texture = canvasTexture(256, 64, (ctx, w, h) => {
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, 'rgba(96,165,250,0.95)');
    base.addColorStop(0.2, 'rgba(37,99,235,0.92)');
    base.addColorStop(0.8, 'rgba(37,99,235,0.92)');
    base.addColorStop(1, 'rgba(96,165,250,0.95)');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(20, h / 2 - 4, 70, 8);
    ctx.beginPath();
    ctx.moveTo(150, h / 2 - 16);
    ctx.lineTo(176, h / 2);
    ctx.lineTo(150, h / 2 + 16);
    ctx.lineTo(160, h / 2);
    ctx.closePath();
    ctx.fill();
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

// 床のぼかした円（選択枠の下に敷く光）
export function glowTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}
