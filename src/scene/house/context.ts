import * as THREE from 'three';
import type { Config } from '../../core/config';
import type { Project, Vec2 } from '../../data/projects';
import { Batch, rng } from '../geometry';
import type { Materials } from '../materials';

export interface LampSpot {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
}

/** Shared state while a house is being assembled. */
export class HouseCtx {
  readonly b = new Batch();
  readonly rnd: () => number;
  readonly group = new THREE.Group();
  readonly lamps: LampSpot[] = [];
  /** Interior points that receive a warm light when the interior lighting is on. */
  readonly roomLights: { pos: THREE.Vector3; power: number }[] = [];
  /** Per-frame callbacks (fire, smoke, water). */
  readonly updaters: ((t: number, dt: number) => void)[] = [];
  /** Smoke source, set when the house has a chimney. */
  chimneyTop: THREE.Vector3 | null = null;
  /** Plan polygon of the exterior walls. */
  readonly outline: Vec2[];

  constructor(public p: Project, public c: Config, public mats: Materials) {
    this.rnd = rng(p.id.length * 7919 + 17);
    this.outline = p.walls.map((w) => w.from);
  }

  inside(x: number, z: number) {
    const poly = this.outline;
    let ins = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i];
      const [xj, zj] = poly[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
    }
    return ins;
  }

  /** Add a non-batched mesh to the house group. */
  add(obj: THREE.Object3D) {
    this.group.add(obj);
    return obj;
  }
}

/** Local frame of a wall: X along the wall, Y up, Z outward. */
export interface WallFrame {
  origin: THREE.Vector3;
  u: THREE.Vector3;
  n: THREE.Vector3;
  len: number;
  matrix: THREE.Matrix4;
  /** Convexity of the corner at the start / end of the wall. */
  startConvex: boolean;
  endConvex: boolean;
}

export function wallFrame(ctx: HouseCtx, i: number): WallFrame {
  const w = ctx.p.walls[i];
  const n = ctx.p.walls.length;
  const prev = ctx.p.walls[(i - 1 + n) % n];
  const next = ctx.p.walls[(i + 1) % n];
  const dirOf = (ww: typeof w) => new THREE.Vector3(ww.to[0] - ww.from[0], 0, ww.to[1] - ww.from[1]).normalize();
  const normalOf = (ww: typeof w) => {
    const d = dirOf(ww);
    const cand = new THREE.Vector3(d.z, 0, -d.x);
    const mx = (ww.from[0] + ww.to[0]) / 2 + cand.x * 0.05;
    const mz = (ww.from[1] + ww.to[1]) / 2 + cand.z * 0.05;
    return ctx.inside(mx, mz) ? cand.negate() : cand;
  };
  const u = dirOf(w);
  const nn = normalOf(w);
  // a corner is convex when the turn agrees with the orientation of the whole outline
  let area = 0;
  for (const ww of ctx.p.walls) area += ww.from[0] * ww.to[1] - ww.to[0] * ww.from[1];
  const corner = (d1: THREE.Vector3, d2: THREE.Vector3) => Math.sign(d1.x * d2.z - d1.z * d2.x) === Math.sign(area);
  const origin = new THREE.Vector3(w.from[0], 0, w.from[1]);
  return {
    origin,
    u,
    n: nn,
    len: Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]),
    matrix: new THREE.Matrix4().makeBasis(u, new THREE.Vector3(0, 1, 0), nn).setPosition(origin),
    startConvex: corner(dirOf(prev), u),
    endConvex: corner(u, dirOf(next)),
  };
}
