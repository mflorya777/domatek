/**
 * Low-level geometry helpers: profile extrusion with proper UVs, interval cutting for openings and
 * a per-material batch that merges thousands of boards into a few draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type P2 = [number, number];

export interface UVOpts {
  /** Metres covered by one texture repeat along the extrusion (grain direction). */
  uSize?: number;
  /** Metres covered by one texture repeat across the profile. */
  vSize?: number;
  uOffset?: number;
  vOffset?: number;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/** Push a triangle making sure its winding agrees with the intended normal. */
function tri(
  pos: number[], nor: number[], uv: number[],
  p: THREE.Vector3[], n: THREE.Vector3[], t: [number, number][], want: THREE.Vector3,
) {
  _a.subVectors(p[1], p[0]);
  _b.subVectors(p[2], p[0]);
  _c.crossVectors(_a, _b);
  const order = _c.dot(want) >= 0 ? [0, 1, 2] : [0, 2, 1];
  for (const i of order) {
    pos.push(p[i].x, p[i].y, p[i].z);
    nor.push(n[i].x, n[i].y, n[i].z);
    uv.push(t[i][0], t[i][1]);
  }
}

/**
 * Extrude a 2D profile (points in the local Y/Z plane) along +X from 0 to `len`.
 * closed: the profile is a closed polygon (normals point away from its interior), caps are added.
 * open: a polyline; normals point to the left of the walking direction (−dz, dy).
 * smooth: average normals at profile vertices (for round sections).
 */
export function extrude(
  profile: P2[], len: number,
  { closed = true, caps = closed, smooth = false, ...uvo }: UVOpts & { closed?: boolean; caps?: boolean; smooth?: boolean } = {},
): THREE.BufferGeometry {
  const uSize = uvo.uSize ?? 2;
  const vSize = uvo.vSize ?? 0.5;
  const u0 = uvo.uOffset ?? 0;
  const v0 = uvo.vOffset ?? 0;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const n = profile.length;
  const segs = closed ? n : n - 1;

  // orientation of a closed polygon (shoelace)
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [y0, z0] = profile[i];
    const [y1, z1] = profile[(i + 1) % n];
    area += y0 * z1 - y1 * z0;
  }
  const ccw = area > 0;

  const segNormals: THREE.Vector3[] = [];
  for (let i = 0; i < segs; i++) {
    const [y0, z0] = profile[i];
    const [y1, z1] = profile[(i + 1) % n];
    const dy = y1 - y0;
    const dz = z1 - z0;
    let nn = closed ? (ccw ? new THREE.Vector3(0, dz, -dy) : new THREE.Vector3(0, -dz, dy)) : new THREE.Vector3(0, -dz, dy);
    nn = nn.normalize();
    segNormals.push(nn);
  }
  const vertNormal = (i: number) => {
    const prev = segNormals[(i - 1 + segs) % segs];
    const next = segNormals[i % segs];
    if (!closed && i === 0) return next;
    if (!closed && i === n - 1) return prev;
    return prev.clone().add(next).normalize();
  };

  let per = 0;
  for (let i = 0; i < segs; i++) {
    const [y0, z0] = profile[i];
    const [y1, z1] = profile[(i + 1) % n];
    const l = Math.hypot(y1 - y0, z1 - z0);
    if (l < 1e-6) continue;
    const p00 = new THREE.Vector3(0, y0, z0);
    const p01 = new THREE.Vector3(0, y1, z1);
    const p10 = new THREE.Vector3(len, y0, z0);
    const p11 = new THREE.Vector3(len, y1, z1);
    const nf = segNormals[i];
    const na = smooth ? vertNormal(i) : nf;
    const nb = smooth ? vertNormal((i + 1) % n) : nf;
    const va = v0 + per / vSize;
    const vb = v0 + (per + l) / vSize;
    const ua = u0;
    const ub = u0 + len / uSize;
    tri(pos, nor, uv, [p00, p10, p11], [na, na, nb], [[ua, va], [ub, va], [ub, vb]], nf);
    tri(pos, nor, uv, [p00, p11, p01], [na, nb, nb], [[ua, va], [ub, vb], [ua, vb]], nf);
    per += l;
  }

  if (caps && closed) {
    const contour = profile.map(([y, z]) => new THREE.Vector2(y, z));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [x, want] of [[0, new THREE.Vector3(-1, 0, 0)], [len, new THREE.Vector3(1, 0, 0)]] as const) {
      for (const f of faces) {
        const pts = f.map((k) => new THREE.Vector3(x, profile[k][0], profile[k][1]));
        const t = f.map((k) => [u0 + profile[k][0] / vSize, v0 + profile[k][1] / vSize] as [number, number]);
        tri(pos, nor, uv, pts, [want, want, want], t, want);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Rectangular profile (width along Y, thickness along +Z from 0) with chamfered front edges. */
export function boardProfile(width: number, thick: number, chamfer = 0.003): P2[] {
  const w = width / 2;
  const c = Math.min(chamfer, w * 0.4, thick * 0.4);
  return [
    [-w, 0],
    [w, 0],
    [w, thick - c],
    [w - c, thick],
    [-w + c, thick],
    [-w, thick - c],
  ];
}

/** Axis-aligned box centred at the origin with world-scaled UVs (texture of `uvSize` metres). */
export function box(sx: number, sy: number, sz: number, uvSize = 1, grain: 'x' | 'y' | 'z' = 'x'): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  projectUV(g, uvSize, grain);
  return g;
}

/**
 * Box-project UVs from positions: the texture U axis follows `grain` wherever the face allows it.
 * Works for any geometry whose faces are mostly axis aligned.
 */
export function projectUV(g: THREE.BufferGeometry, uvSize = 1, grain: 'x' | 'y' | 'z' = 'x', u0 = 0, v0 = 0) {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // the two in-plane axes of the face
    let a: number;
    let b: number;
    if (ax >= ay && ax >= az) [a, b] = grain === 'y' ? [y, z] : [z, y];
    else if (ay >= az) [a, b] = grain === 'z' ? [z, x] : [x, z];
    else [a, b] = grain === 'y' ? [y, x] : [x, y];
    uv[i * 2] = u0 + a / uvSize;
    uv[i * 2 + 1] = v0 + b / uvSize;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Reverse triangle winding after a mirroring transform. */
export function flipWinding(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const u = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) {
    for (const a of [p, n, u]) {
      for (let k = 0; k < a.itemSize; k++) {
        const t = a.array[(i + 1) * a.itemSize + k];
        (a.array as Float32Array)[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k];
        (a.array as Float32Array)[(i + 2) * a.itemSize + k] = t;
      }
    }
  }
  p.needsUpdate = true;
}

/** Plain quad in the local XY plane facing +Z, UVs in metres / size. */
export function quad(w: number, h: number, uSize = 1, vSize = uSize, u0 = 0, v0 = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h).toNonIndexed();
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (p.getX(i) + w / 2) / uSize, v0 + (p.getY(i) + h / 2) / vSize);
  return g;
}

/* ---------------------------------------------------------------- intervals */

export type Interval = [number, number];

/** Subtract blocked intervals from [a, b]. */
export function freeIntervals(a: number, b: number, blocked: Interval[], minLen = 0.01): Interval[] {
  const bl = blocked
    .map(([x, y]) => [Math.max(a, x), Math.min(b, y)] as Interval)
    .filter(([x, y]) => y > x)
    .sort((p, q) => p[0] - q[0]);
  const out: Interval[] = [];
  let cur = a;
  for (const [x, y] of bl) {
    if (x > cur) out.push([cur, x]);
    cur = Math.max(cur, y);
  }
  if (b > cur) out.push([cur, b]);
  return out.filter(([x, y]) => y - x >= minLen);
}

/* ---------------------------------------------------------------- batching */

/** Collects geometry per material key and merges it into one mesh per material. */
export class Batch {
  private parts = new Map<string, THREE.BufferGeometry[]>();

  add(key: string, g: THREE.BufferGeometry, m?: THREE.Matrix4) {
    let geo = g.index ? g.toNonIndexed() : g;
    if (!geo.getAttribute('uv')) {
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
    }
    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    }
    if (m) {
      geo = geo === g ? geo.clone() : geo;
      geo.applyMatrix4(m);
      if (m.determinant() < 0) flipWinding(geo);
    }
    const arr = this.parts.get(key) ?? [];
    arr.push(geo);
    this.parts.set(key, arr);
  }

  build(materials: (key: string) => THREE.Material, opts: { castShadow?: boolean; receiveShadow?: boolean } = {}) {
    const group = new THREE.Group();
    for (const [key, geos] of this.parts) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, materials(key));
      mesh.name = key;
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      group.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.parts.clear();
    return group;
  }
}

/** Deterministic pseudo random generator (mulberry32) so the model is identical between rebuilds. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Matrix for a frame given by origin and three axis vectors. */
export function frame(o: THREE.Vector3, x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) {
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(o);
}
