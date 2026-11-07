import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  cardboardTexture,
  floorTexture,
  glowTexture,
  routeTexture,
  signTexture,
  textDecal,
  wrapTexture,
} from '../../src/scene/textures.js';

describe('テクスチャ', () => {
  it.each([
    ['cardboardTexture', cardboardTexture],
    ['wrapTexture', wrapTexture],
    ['glowTexture', glowTexture],
    ['signTexture', () => signTexture('A1')],
  ])('%s は sRGB の CanvasTexture を返す', (_name, create) => {
    const texture = create();
    expect(texture).toBeInstanceOf(THREE.CanvasTexture);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('floorTexture は、縦横とも繰り返す', () => {
    const texture = floorTexture();
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
  });

  it('routeTexture は、帯の長さ方向（横）に繰り返す', () => {
    expect(routeTexture().wrapS).toBe(THREE.RepeatWrapping);
  });
});

describe('textDecal', () => {
  it('文字の幅に応じて、縦横比が正の値になる', () => {
    const { texture, aspect } = textDecal('INBOUND');
    expect(texture).toBeInstanceOf(THREE.CanvasTexture);
    expect(aspect).toBeGreaterThan(0);
  });

  it('文字が長いほど横長になる', () => {
    expect(textDecal('PICKING AREA').aspect).toBeGreaterThan(textDecal('01').aspect);
  });

  it('行を増やすと、同じ長さでも縦長になる', () => {
    expect(textDecal(['OUTBOUND', 'STAGING']).aspect).toBeLessThan(textDecal('OUTBOUND').aspect);
  });

  it('文字列でも配列でも、1 行なら同じ縦横比になる', () => {
    expect(textDecal(['INBOUND']).aspect).toBe(textDecal('INBOUND').aspect);
  });
});
