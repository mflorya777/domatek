import * as THREE from 'three';
import type { Config } from '../../core/config';
import { getProject } from '../../data/projects';
import type { Materials } from '../materials';
import { buildBase } from './base';
import { HouseCtx } from './context';
import { buildFurako, buildFurniture } from './extras';
import { buildInterior } from './interior';
import { buildRoof } from './roof';
import { createSmoke } from './smoke';
import { buildWalls } from './walls';

/** Light with day / night intensities; the engine blends them with the time of day. */
export type RigLight = THREE.Light & { userData: { day: number; night: number; flicker?: boolean } };

export interface HouseModel {
  group: THREE.Group;
  lights: RigLight[];
  /** Additive light-wash decals of the wall lamps (opacity follows the evening factor). */
  washes: THREE.Mesh[];
  updaters: ((t: number, dt: number) => void)[];
  stepFoot: { pos: THREE.Vector3; dir: THREE.Vector3 } | null;
  /** Plan rectangles that must stay free of grass and vegetation. */
  footprint: THREE.Box3;
  deckRects: [number, number, number, number][];
  smoke: { setEvening(v: number): void } | null;
  dispose(): void;
}

const NO_SHADOW = new Set(['glass', 'led', 'ledCool', 'lampGlow', 'salt']);

let washTexture: THREE.Texture | null = null;
function getWashTexture() {
  if (washTexture) return washTexture;
  const w = 128;
  const h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / w - 0.5) * 2;
      const ny = (y / h - 0.5) * 2;
      const dist = Math.abs(ny);
      // two cones (up and down) widening away from the fixture
      const width = 0.08 + dist * 0.55;
      const across = Math.max(0, 1 - (nx / width) ** 2);
      const along = Math.max(0, 1 - dist) ** 1.6;
      const core = Math.exp(-(nx * nx + ny * ny) * 30) * 0.6;
      const v = Math.min(1, across * along * 0.9 + core);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  washTexture = new THREE.CanvasTexture(cv);
  washTexture.colorSpace = THREE.SRGBColorSpace;
  return washTexture;
}

export function buildHouse(config: Config, mats: Materials): HouseModel {
  const p = getProject(config.project);
  const ctx = new HouseCtx(p, config, mats);
  buildWalls(ctx);
  buildRoof(ctx);
  const base = buildBase(ctx);
  buildInterior(ctx);
  if (config.furako) buildFurako(ctx);
  if (config.furniture) buildFurniture(ctx);

  const merged = ctx.b.build((k) => mats.resolve(k, config));
  merged.traverse((o) => {
    if (o instanceof THREE.Mesh && NO_SHADOW.has(o.name)) {
      o.castShadow = false;
      o.userData.noAO = true;
      if (o.name === 'glass') o.renderOrder = 2;
    }
  });
  ctx.group.add(merged);

  const lights: RigLight[] = [];
  ctx.group.traverse((o) => {
    if (o instanceof THREE.Light && o.userData.night !== undefined) lights.push(o as RigLight);
  });

  // interior lighting: downward spots so the light stays inside the rooms
  const interiorOn = config.package !== 'shell';
  for (const rl of ctx.roomLights) {
    const s = new THREE.SpotLight(0xffd3a1, 0, 4.5, 1.2, 1, 1.6) as unknown as RigLight;
    s.position.copy(rl.pos);
    (s as unknown as THREE.SpotLight).target.position.set(rl.pos.x, 0, rl.pos.z);
    s.userData = { day: interiorOn ? 5 * rl.power : 1.5, night: interiorOn ? 9 * rl.power : 3 };
    ctx.group.add(s, (s as unknown as THREE.SpotLight).target);
    lights.push(s);
  }

  // wall lamp washes
  const washes: THREE.Mesh[] = [];
  const washMat = new THREE.MeshBasicMaterial({
    map: getWashTexture(),
    color: 0xffb877,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  ctx.lamps.forEach((l, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), washMat);
    m.position.copy(l.pos).addScaledVector(l.normal, -0.112);
    m.lookAt(m.position.clone().add(l.normal));
    m.userData.noAO = true;
    m.renderOrder = 3;
    ctx.group.add(m);
    washes.push(m);
    if (i < 3) {
      const pl = new THREE.PointLight(0xffb877, 0, 3.2, 2) as unknown as RigLight;
      pl.position.copy(l.pos).addScaledVector(l.normal, 0.15);
      pl.userData = { day: 0, night: 1.6 };
      ctx.group.add(pl);
      lights.push(pl);
    }
  });

  let smoke: HouseModel['smoke'] = null;
  if (ctx.chimneyTop && config.stove !== 'electric') {
    const s = createSmoke(ctx.chimneyTop);
    ctx.group.add(s.object);
    ctx.updaters.push(s.update);
    smoke = s;
  }

  const footprint = new THREE.Box3();
  for (const w of p.walls) {
    footprint.expandByPoint(new THREE.Vector3(w.from[0], 0, w.from[1]));
  }
  for (const r of base.deckRects) {
    footprint.expandByPoint(new THREE.Vector3(r[0], 0, r[1]));
    footprint.expandByPoint(new THREE.Vector3(r[2], 0, r[3]));
  }
  footprint.max.y = 4;

  return {
    group: ctx.group,
    lights,
    washes,
    updaters: ctx.updaters,
    stepFoot: base.stepFoot,
    footprint,
    deckRects: base.deckRects,
    smoke,
    dispose() {
      ctx.group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) o.geometry.dispose();
      });
      washMat.dispose();
    },
  };
}
