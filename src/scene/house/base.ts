/**
 * Foundation and outdoor carpentry: steel module frame on screw piles, plinth variants
 * (open piles, firewood stack, profiled sheet), the deck with steel/timber rim and the steps.
 */
import * as THREE from 'three';
import { CLAD_BOTTOM, FLOOR_Y, type Rect, type Steps } from '../../data/projects';
import { boardProfile, box, extrude } from '../geometry';
import { wallFrame, type HouseCtx } from './context';
import { CF, ribProfile } from './walls';

const BEAM_TOP = CLAD_BOTTOM;
const BEAM_H = 0.16;
export const DECK_TOP = FLOOR_Y - 0.02;
const DECK_T = 0.028;

interface Seg {
  a: THREE.Vector3;
  b: THREE.Vector3;
  /** Outward normal. */
  n: THREE.Vector3;
  /** Front plane offset of the plinth along n. */
  front: number;
  top: number;
}

export interface BaseResult {
  stepFoot: { pos: THREE.Vector3; dir: THREE.Vector3 } | null;
  deckRects: Rect[];
}

function pile(ctx: HouseCtx, x: number, z: number, top: number) {
  const len = top + 0.3;
  const g = new THREE.CylinderGeometry(0.054, 0.054, len, 20);
  g.translate(x, top - len / 2, z);
  ctx.b.add('blackSteel', g);
  const head = box(0.2, 0.01, 0.2);
  head.translate(x, top - 0.005, z);
  ctx.b.add('blackSteel', head);
}

function activeDeckRects(ctx: HouseCtx): Rect[] {
  const { p, c } = ctx;
  if (p.id === 'nord' && !c.deck) return [];
  const ext = c.deckExtended ? p.deck.extension : undefined;
  const rects = p.deck.rects.map((r) => [...r] as Rect);
  if (ext) {
    for (const r of rects) {
      if (r[0] >= ext[0] && r[2] <= ext[2] && r[3] > ext[1] && r[1] < ext[1]) r[3] = ext[1];
    }
    rects.push([...ext] as Rect);
  }
  return rects;
}

export function buildBase(ctx: HouseCtx): BaseResult {
  const { p, c } = ctx;
  const plinthSegs: Seg[] = [];

  // module perimeter frame and piles
  p.walls.forEach((_, i) => {
    const wf = wallFrame(ctx, i);
    const g = box(wf.len, BEAM_H, 0.15);
    g.translate(wf.len / 2, BEAM_TOP - BEAM_H / 2, -0.085);
    ctx.b.add('blackSteel', g, wf.matrix);
    const count = Math.max(1, Math.ceil(wf.len / 2.0));
    for (let k = 0; k < count; k++) {
      const s = 0.12 + (k / count) * (wf.len - 0.24);
      const pt = new THREE.Vector3(s, 0, -0.085).applyMatrix4(wf.matrix);
      pile(ctx, pt.x, pt.z, BEAM_TOP - BEAM_H);
    }
    const a = wf.origin.clone().addScaledVector(wf.u, wf.startConvex ? -CF : CF);
    const b = wf.origin.clone().addScaledVector(wf.u, wf.len + (wf.endConvex ? CF : -CF));
    plinthSegs.push({ a, b, n: wf.n.clone(), front: CF - 0.02, top: CLAD_BOTTOM - 0.03 });
  });

  const deckRects = activeDeckRects(ctx);
  let stepFoot: BaseResult['stepFoot'] = null;
  if (deckRects.length) {
    for (const r of deckRects) buildDeckRect(ctx, r, deckRects, plinthSegs);
    const st = c.deckExtended && p.deck.extensionSteps ? p.deck.extensionSteps : p.deck.steps;
    stepFoot = buildSteps(ctx, st);
  }

  if (c.plinth === 'firewood') buildFirewood(ctx, plinthSegs);
  else if (c.plinth === 'profile') {
    for (const s of plinthSegs) {
      const len = s.a.distanceTo(s.b);
      const u = s.b.clone().sub(s.a).normalize();
      const m = new THREE.Matrix4().makeBasis(u, new THREE.Vector3(0, 1, 0), s.n).setPosition(s.a);
      const g = extrude(ribProfile(0, len), s.top + 0.02, { closed: false, uSize: 1, vSize: 1 });
      g.rotateZ(Math.PI / 2);
      g.translate(0, -0.02, s.front - 0.025);
      ctx.b.add('accentMetal', g, m);
    }
  }
  return { stepFoot, deckRects };
}

function buildDeckRect(ctx: HouseCtx, r0: Rect, all: Rect[], plinthSegs: Seg[]) {
  const r = [...r0] as Rect;
  const inHouse = (x: number, z: number) => ctx.inside(x, z);
  const inDeck = (x: number, z: number) => all.some((q) => q !== r0 && x > q[0] && x < q[2] && z > q[1] && z < q[3]);
  const mx = (r[0] + r[2]) / 2;
  const mz = (r[1] + r[3]) / 2;
  const e = 0.06;
  // edges: shrink where they touch the house cladding
  const touch = {
    x0: inHouse(r[0] - e, mz),
    x1: inHouse(r[2] + e, mz),
    z0: inHouse(mx, r[1] - e),
    z1: inHouse(mx, r[3] + e),
  };
  if (touch.x0) r[0] += CF + 0.006;
  if (touch.x1) r[2] -= CF + 0.006;
  if (touch.z0) r[1] += CF + 0.006;
  if (touch.z1) r[3] -= CF + 0.006;
  const open = {
    x0: !touch.x0 && !inDeck(r0[0] - e, mz),
    x1: !touch.x1 && !inDeck(r0[2] + e, mz),
    z0: !touch.z0 && !inDeck(mx, r0[1] - e),
    z1: !touch.z1 && !inDeck(mx, r0[3] + e),
  };

  const along = ctx.p.deck.boardsAlong;
  const L = along === 'x' ? r[2] - r[0] : r[3] - r[1];
  const W = along === 'x' ? r[3] - r[1] : r[2] - r[0];
  const pitch = 0.146;
  const bw = 0.14;
  const yTop = DECK_TOP;
  for (let t = 0; t < W - 0.02; t += pitch) {
    const w = Math.min(bw, W - t);
    const g = extrude(boardProfile(w, DECK_T, 0.004), L + (along === 'x' ? 0 : 0), { uOffset: ctx.rnd(), vOffset: ctx.rnd() });
    // board: X length, Y width, Z thickness (top)
    const m = along === 'x'
      ? new THREE.Matrix4().set(1, 0, 0, r[0], 0, 0, 1, yTop - DECK_T, 0, -1, 0, r[1] + t + w / 2, 0, 0, 0, 1)
      : new THREE.Matrix4().set(0, 1, 0, r[0] + t + w / 2, 0, 0, 1, yTop - DECK_T, 1, 0, 0, r[1], 0, 0, 0, 1);
    ctx.b.add('deck', g, m);
  }

  // joists across the boards
  const jy = yTop - DECK_T - 0.05;
  if (along === 'x') {
    for (let x = r[0] + 0.1; x < r[2]; x += 0.5) {
      const j = box(0.04, 0.1, r[3] - r[1]);
      j.translate(x, jy, (r[1] + r[3]) / 2);
      ctx.b.add('blackSteel', j);
    }
  } else {
    for (let z = r[1] + 0.1; z < r[3]; z += 0.5) {
      const j = box(r[2] - r[0], 0.1, 0.04);
      j.translate((r[0] + r[2]) / 2, jy, z);
      ctx.b.add('blackSteel', j);
    }
  }

  // rim on the open edges + piles
  const rimKey = ctx.p.deck.rim === 'steel' ? 'blackSteel' : 'warm';
  const rimH = 0.17;
  const rimT = ctx.p.deck.rim === 'steel' ? 0.06 : 0.022;
  const yr = yTop - DECK_T - rimH / 2 + 0.002;
  const edges: { on: boolean; a: [number, number]; b: [number, number]; n: [number, number] }[] = [
    { on: open.z1, a: [r[0], r[3]], b: [r[2], r[3]], n: [0, 1] },
    { on: open.x1, a: [r[2], r[3]], b: [r[2], r[1]], n: [1, 0] },
    { on: open.z0, a: [r[2], r[1]], b: [r[0], r[1]], n: [0, -1] },
    { on: open.x0, a: [r[0], r[1]], b: [r[0], r[3]], n: [-1, 0] },
  ];
  for (const ed of edges) {
    if (!ed.on) continue;
    const a = new THREE.Vector3(ed.a[0], 0, ed.a[1]);
    const b = new THREE.Vector3(ed.b[0], 0, ed.b[1]);
    const len = a.distanceTo(b);
    const u = b.clone().sub(a).normalize();
    const n = new THREE.Vector3(ed.n[0], 0, ed.n[1]);
    const m = new THREE.Matrix4().makeBasis(u, new THREE.Vector3(0, 1, 0), n).setPosition(a);
    if (rimKey === 'warm') {
      const g = extrude(boardProfile(rimH, rimT, 0.004), len + 2 * rimT, { uOffset: ctx.rnd(), vOffset: ctx.rnd() });
      g.translate(-rimT, yr, -0.002);
      ctx.b.add('warm', g, m);
    } else {
      const g = box(len + 0.02, rimH, rimT);
      g.translate(len / 2, yr, -rimT / 2 + 0.004);
      ctx.b.add('blackSteel', g, m);
    }
    const count = Math.max(1, Math.ceil(len / 1.7));
    for (let k = 0; k <= count; k++) {
      const pt = a.clone().addScaledVector(u, 0.1 + (k / count) * (len - 0.2)).addScaledVector(n, -0.12);
      pile(ctx, pt.x, pt.z, yTop - DECK_T - 0.1);
    }
    plinthSegs.push({ a, b, n, front: rimKey === 'warm' ? 0 : 0.0, top: yTop - DECK_T - rimH });
  }
}

function buildSteps(ctx: HouseCtx, st: Steps): BaseResult['stepFoot'] {
  const n = Math.max(2, Math.round(DECK_TOP / 0.175));
  const rise = DECK_TOP / n;
  const run = 0.3;
  const dir = new THREE.Vector3(st.dir.endsWith('x') ? 1 : 0, 0, st.dir.endsWith('z') ? 1 : 0).multiplyScalar(st.dir.startsWith('-') ? -1 : 1);
  const side = new THREE.Vector3(dir.z, 0, -dir.x);
  const origin = new THREE.Vector3(st.at[0], 0, st.at[1]);
  const m = new THREE.Matrix4().makeBasis(side, new THREE.Vector3(0, 1, 0), dir).setPosition(origin);
  const w = st.width;
  // treads (two boards each)
  for (let k = 1; k < n; k++) {
    const y = DECK_TOP - k * rise;
    for (let j = 0; j < 2; j++) {
      const g = extrude(boardProfile(0.142, DECK_T, 0.004), w, { uOffset: ctx.rnd(), vOffset: ctx.rnd() });
      // X → side, Y → depth (dir), Z → up
      const mm = new THREE.Matrix4().set(1, 0, 0, -w / 2, 0, 0, 1, y - DECK_T, 0, 1, 0, (k - 1) * run + 0.08 + j * 0.146, 0, 0, 0, 1);
      ctx.b.add('deck', g, m.clone().multiply(mm));
    }
  }
  // sawtooth steel stringers
  const shape = new THREE.Shape();
  shape.moveTo(0, DECK_TOP - 0.03);
  for (let k = 1; k < n; k++) {
    shape.lineTo((k - 1) * run + 0.08, DECK_TOP - (k - 1) * rise - 0.03 - (k === 1 ? 0 : 0));
    shape.lineTo((k - 1) * run + 0.08, DECK_TOP - k * rise - DECK_T);
    shape.lineTo(k * run + 0.08, DECK_TOP - k * rise - DECK_T);
  }
  shape.lineTo((n - 1) * run + 0.08, 0.0);
  shape.lineTo((n - 1) * run - 0.12, 0.0);
  shape.lineTo(0, DECK_TOP - 0.25);
  shape.closePath();
  for (const sx of [-w / 2 + 0.04, w / 2 - 0.05]) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
    // shape X → depth (dir), shape Y → up, extrusion → side
    const mm = new THREE.Matrix4().set(0, 0, 1, sx, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
    ctx.b.add('blackSteel', g, m.clone().multiply(mm));
  }
  const foot = origin.clone().addScaledVector(dir, (n - 1) * run + 0.45);
  return { pos: foot, dir };
}

/* ---------------------------------------------------------------- firewood plinth */

function logGeometry(variant: number) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
  // caps: remap UVs to the atlas quadrant (2×2)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const ox = (variant % 2) * 0.5;
  const oy = (1 - Math.floor(variant / 2)) * 0.5;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(nrm.getY(i)) > 0.9) uv.setXY(i, ox + 0.5 * (0.04 + 0.92 * uv.getX(i)), oy + 0.5 * (0.04 + 0.92 * uv.getY(i)));
    else uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 0.6);
  }
  return g;
}

function buildFirewood(ctx: HouseCtx, segs: Seg[]) {
  const mats = ctx.mats;
  const birchBark = mats.barkMaterial('birch');
  const pineBark = mats.barkMaterial('pine');
  const end = mats.endGrain();
  const variants = [0, 1, 2, 3].map((v) => ({
    geo: logGeometry(v),
    bark: v === 1 ? pineBark : v === 2 ? pineBark : birchBark,
    mats: [] as THREE.Matrix4[],
  }));
  const dummy = new THREE.Object3D();
  for (const s of segs) {
    const len = s.a.distanceTo(s.b);
    const u = s.b.clone().sub(s.a).normalize();
    let y = 0.065;
    let row = 0;
    while (y < s.top - 0.04) {
      let t = row % 2 ? 0.03 : 0.07;
      while (t < len - 0.05) {
        const r = 0.048 + ctx.rnd() * 0.03;
        const cy = Math.min(y + (ctx.rnd() - 0.5) * 0.015, s.top - r);
        if (cy - r < -0.01) break;
        const l = 0.33 + ctx.rnd() * 0.08;
        const pos = s.a.clone().addScaledVector(u, t + r).addScaledVector(s.n, s.front - l / 2 + (ctx.rnd() - 0.3) * 0.03);
        pos.y = cy;
        dummy.position.copy(pos);
        dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.n);
        dummy.rotateY(ctx.rnd() * Math.PI * 2);
        dummy.scale.set(r, l, r * (0.9 + ctx.rnd() * 0.15));
        dummy.updateMatrix();
        variants[Math.floor(ctx.rnd() * 4)].mats.push(dummy.matrix.clone());
        t += 2 * r * 0.98;
      }
      y += 0.11;
      row++;
    }
  }
  for (const v of variants) {
    if (!v.mats.length) continue;
    const mesh = new THREE.InstancedMesh(v.geo, [v.bark, end, end], v.mats.length);
    v.mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = mesh.receiveShadow = true;
    ctx.add(mesh);
  }
}
