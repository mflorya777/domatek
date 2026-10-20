/**
 * Roofs (flat roof with steel fascia / timber fascia with ribbed steel sheet), deck canopy and chimney.
 */
import * as THREE from 'three';
import { WALL_TOP, type Rect, type Vec2 } from '../../data/projects';
import { boardProfile, box, extrude, quad } from '../geometry';
import type { HouseCtx } from './context';
import { CF, ribProfile } from './walls';
import { DECK_TOP } from './base';

/** Offset an orthogonal polygon outward by d. */
function offsetOutline(ctx: HouseCtx, pts: Vec2[], d: number): Vec2[] {
  const n = pts.length;
  const normals: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % n];
    const l = Math.hypot(x1 - x0, z1 - z0);
    let nx = (z1 - z0) / l;
    let nz = -(x1 - x0) / l;
    if (ctx.inside((x0 + x1) / 2 + nx * 0.05, (z0 + z1) / 2 + nz * 0.05)) [nx, nz] = [-nx, -nz];
    normals.push([nx, nz]);
  }
  return pts.map(([x, z], i) => {
    const a = normals[(i - 1 + n) % n];
    const b = normals[i];
    return [x + (a[0] + b[0]) * d, z + (a[1] + b[1]) * d] as Vec2;
  });
}

const rectPts = (r: Rect): Vec2[] => [[r[0], r[1]], [r[0], r[3]], [r[2], r[3]], [r[2], r[1]]];

function shapeOf(pts: Vec2[]) {
  return new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
}

/** Prism of a plan polygon between y0 and y1 (caps material 0, sides material 1). */
function slab(pts: Vec2[], y0: number, y1: number, hole?: Vec2[]) {
  const shape = shapeOf(pts);
  if (hole) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

export function buildRoof(ctx: HouseCtx) {
  const { p, mats, c } = ctx;
  const accent = mats.paintedMetal(c.accentColor, 0.45);
  if (p.roof.style === 'flat-metal') {
    const outer = offsetOutline(ctx, ctx.outline, CF + p.roof.overhang);
    const g = slab(outer, WALL_TOP - 0.02, WALL_TOP + 0.17);
    const mesh = new THREE.Mesh(g, [mats.std.membrane, accent]);
    mesh.castShadow = mesh.receiveShadow = true;
    ctx.add(mesh);
    // coping lip
    const inner = offsetOutline(ctx, ctx.outline, CF + p.roof.overhang - 0.07);
    const lip = new THREE.Mesh(slab(outer, WALL_TOP + 0.17, WALL_TOP + 0.2, inner), accent);
    lip.castShadow = lip.receiveShadow = true;
    ctx.add(lip);
  } else {
    const r = p.roof.rect!;
    const d = CF + p.roof.overhang;
    const rr: Rect = [r[0] - d, r[1] - d, r[2] + d, r[3] + d];
    const y0 = WALL_TOP - 0.02;
    const y1 = WALL_TOP + 0.3;
    const core = new THREE.Mesh(slab(rectPts(rr), y0 + 0.01, y1 - 0.005), mats.std.backing);
    core.castShadow = true;
    ctx.add(core);
    timberFascia(ctx, rr, y0, y1);
    // ribbed steel sheet on top, ribs running from front to back
    const sheetW = rr[2] - rr[0] + 0.06;
    const sheet = extrude(ribProfile(0, sheetW), rr[3] - rr[1] + 0.08, { closed: false, uSize: 1, vSize: 1 });
    // extrude space: X = length → world Z, Y = −s → world X, Z = rib height → world Y
    ctx.b.add('roofMetal', sheet, new THREE.Matrix4().set(
      0, -1, 0, rr[0] - 0.03,
      0, 0, 1, y1,
      1, 0, 0, rr[1] - 0.04,
      0, 0, 0, 1,
    ));
    // soffit boards under the overhangs and the porch: length along Z, width along X, facing down
    for (let x = rr[0]; x < rr[2] - 0.01; x += 0.124) {
      const w = Math.min(0.118, rr[2] - x);
      const bd = extrude(boardProfile(w, 0.016, 0.003), rr[3] - rr[1], { uOffset: ctx.rnd(), vOffset: ctx.rnd() });
      ctx.b.add('warm', bd, new THREE.Matrix4().set(
        0, 1, 0, x + w / 2,
        0, 0, -1, y0,
        1, 0, 0, rr[1],
        0, 0, 0, 1,
      ));
    }
  }
  if (p.porch) buildPorchFrame(ctx, p.porch.rect, p.porch.posts);
  if (c.canopy && p.canopy && c.deck) buildCanopy(ctx, p.canopy.rect, accent);
  if (c.stove !== 'electric') buildChimney(ctx);
}

function timberFascia(ctx: HouseCtx, rr: Rect, y0: number, y1: number) {
  const t = 0.022;
  const rows = 2;
  const h = (y1 - y0) / rows;
  const edges: { o: THREE.Vector3; u: THREE.Vector3; n: THREE.Vector3; len: number }[] = [
    { o: new THREE.Vector3(rr[0], 0, rr[3]), u: new THREE.Vector3(1, 0, 0), n: new THREE.Vector3(0, 0, 1), len: rr[2] - rr[0] },
    { o: new THREE.Vector3(rr[2], 0, rr[3]), u: new THREE.Vector3(0, 0, -1), n: new THREE.Vector3(1, 0, 0), len: rr[3] - rr[1] },
    { o: new THREE.Vector3(rr[2], 0, rr[1]), u: new THREE.Vector3(-1, 0, 0), n: new THREE.Vector3(0, 0, -1), len: rr[2] - rr[0] },
    { o: new THREE.Vector3(rr[0], 0, rr[1]), u: new THREE.Vector3(0, 0, 1), n: new THREE.Vector3(-1, 0, 0), len: rr[3] - rr[1] },
  ];
  for (const e of edges) {
    const m = new THREE.Matrix4().makeBasis(e.u, new THREE.Vector3(0, 1, 0), e.n).setPosition(e.o);
    for (let i = 0; i < rows; i++) {
      const g = extrude(boardProfile(h - 0.006, t, 0.004), e.len + 2 * t, { uOffset: ctx.rnd(), vOffset: ctx.rnd() });
      g.translate(-t, y0 + h * i + h / 2, 0);
      ctx.b.add('warm', g, m);
    }
  }
}

/** Black steel portal framing the porch opening: corner posts and a header beam. */
function buildPorchFrame(ctx: HouseCtx, r: Rect, posts: Vec2[]) {
  const s = 0.09;
  const y0 = DECK_TOP;
  const y1 = WALL_TOP - 0.02;
  for (const [x, z] of posts) {
    // posts sit just inside the opening, flush with the cladding of the blocks
    const inward = x <= r[0] + 0.01 ? 1 : -1;
    const g = box(s, y1 - y0, s);
    g.translate(x + inward * (s / 2 - 0.02), (y0 + y1) / 2, z + CF - s / 2 + 0.01);
    ctx.b.add('blackSteel', g);
  }
  const head = box(r[2] - r[0], 0.12, s);
  head.translate((r[0] + r[2]) / 2, y1 - 0.06, r[3] + CF - s / 2 + 0.01);
  ctx.b.add('blackSteel', head);
}

function buildCanopy(ctx: HouseCtx, r: Rect, accent: THREE.Material) {
  const y1 = WALL_TOP + 0.12;
  const y0 = WALL_TOP - 0.1;
  // canopy roof slab overlapping the walls slightly
  const rr: Rect = [r[0] - 0.08, r[1], r[2], r[3] + 0.08];
  const mesh = new THREE.Mesh(slab(rectPts(rr), y0, y1), [ctx.mats.std.membrane, accent]);
  mesh.castShadow = mesh.receiveShadow = true;
  ctx.add(mesh);
  // soffit
  for (let x = rr[0] + 0.02; x < rr[2] - 0.01; x += 0.124) {
    const w = Math.min(0.118, rr[2] - x);
    const g = quad(w, rr[3] - rr[1], 2, 0.5, ctx.rnd(), ctx.rnd());
    g.rotateX(Math.PI / 2);
    g.translate(x + w / 2, y0 - 0.001, (rr[1] + rr[3]) / 2);
    ctx.b.add('warm', g);
  }
  // single steel post at the free corner, beams along the open edges
  const post = box(0.1, y0 - 0.55, 0.1);
  post.translate(r[0] + 0.02, (y0 + 0.55) / 2, r[3] - 0.02);
  ctx.b.add('blackSteel', post);
  const beamA = box(r[2] - r[0], 0.16, 0.1);
  beamA.translate((r[0] + r[2]) / 2, y0 - 0.08, r[3] - 0.02);
  ctx.b.add('blackSteel', beamA);
  const beamB = box(0.1, 0.16, r[3] - r[1]);
  beamB.translate(r[0] + 0.02, y0 - 0.08, (r[1] + r[3]) / 2);
  ctx.b.add('blackSteel', beamB);
}

function buildChimney(ctx: HouseCtx) {
  const { p } = ctx;
  const [x, z] = p.stove.at;
  const top = p.roof.style === 'flat-metal' ? WALL_TOP + 0.17 : WALL_TOP + 0.32;
  const h = 1.35;
  const r = 0.105;
  const pipe = new THREE.CylinderGeometry(r, r, h, 48, 1, true);
  pipe.translate(x, top + h / 2, z);
  ctx.b.add('stainless', pipe);
  for (const yy of [0.45, 0.95]) {
    const col = new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.03, 48);
    col.translate(x, top + yy, z);
    ctx.b.add('stainless', col);
  }
  // roof boot
  const boot = new THREE.CylinderGeometry(r + 0.01, r + 0.12, 0.16, 40);
  boot.translate(x, top + 0.08, z);
  ctx.b.add('rubber', boot);
  // top: spark arrester ring and a conical cap on three legs
  const ring = new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.08, 48);
  ring.translate(x, top + h, z);
  ctx.b.add('stainless', ring);
  const cap = new THREE.ConeGeometry(r + 0.07, 0.1, 48, 1, true);
  cap.translate(x, top + h + 0.17, z);
  ctx.b.add('stainless', cap);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = box(0.008, 0.14, 0.02);
    leg.translate(x + Math.cos(a) * (r + 0.005), top + h + 0.1, z + Math.sin(a) * (r + 0.005));
    ctx.b.add('stainless', leg);
  }
  ctx.chimneyTop = new THREE.Vector3(x, top + h + 0.2, z);
}
