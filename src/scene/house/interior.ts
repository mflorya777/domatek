/**
 * Interior visible through the glazing: floors, lined ceilings, partitions, sauna benches with LED,
 * the heater with its stones, rest-room furniture and interior lights.
 */
import * as THREE from 'three';
import { CEILING_H, FLOOR_Y, type Rect, type Room } from '../../data/projects';
import { boardProfile, box, extrude } from '../geometry';
import type { HouseCtx } from './context';

const CEIL = FLOOR_Y + CEILING_H;

/** Boards over a rectangle at height y; facing up (floor) or down (ceiling). */
function boardsOver(ctx: HouseCtx, r: Rect, y: number, up: boolean, key: string, width = 0.12, along: 'x' | 'z' = 'x') {
  const L = along === 'x' ? r[2] - r[0] : r[3] - r[1];
  const W = along === 'x' ? r[3] - r[1] : r[2] - r[0];
  for (let t = 0; t < W - 0.005; t += width + 0.003) {
    const w = Math.min(width, W - t);
    const g = extrude(boardProfile(w, 0.016, 0.002), L, { uOffset: ctx.rnd(), vOffset: ctx.rnd() });
    const sgn = up ? 1 : -1;
    const m = along === 'x'
      ? new THREE.Matrix4().set(1, 0, 0, r[0], 0, 0, sgn, y - sgn * 0.016, 0, -sgn, 0, r[1] + t + w / 2, 0, 0, 0, 1)
      : new THREE.Matrix4().set(0, sgn, 0, r[0] + t + w / 2, 0, 0, sgn, y - sgn * 0.016, 1, 0, 0, r[1], 0, 0, 0, 1);
    ctx.b.add(key, g, m);
  }
}

const rectOf = (room: Room) => room.rects.reduce((best, r) => ((r[2] - r[0]) * (r[3] - r[1]) > (best[2] - best[0]) * (best[3] - best[1]) ? r : best));

export function buildInterior(ctx: HouseCtx) {
  const { p, c } = ctx;
  const shell = c.package === 'shell';
  for (const room of p.rooms) {
    for (const r of room.rects) {
      // floors
      if (shell) boardsOver(ctx, r, FLOOR_Y, true, 'osb', 0.6);
      else if (room.kind === 'wash') {
        const g = box(r[2] - r[0], 0.02, r[3] - r[1], 1.2);
        g.translate((r[0] + r[2]) / 2, FLOOR_Y - 0.01, (r[1] + r[3]) / 2);
        ctx.b.add('tile', g);
      } else boardsOver(ctx, r, FLOOR_Y, true, room.kind === 'rest' ? 'floor' : 'lining', room.kind === 'rest' ? 0.18 : 0.09, 'z');
      // ceilings
      boardsOver(ctx, r, CEIL, false, shell ? 'osb' : 'lining', shell ? 0.6 : 0.09);
    }
  }

  // partitions
  for (const pt of p.partitions) {
    const a = new THREE.Vector3(pt.from[0], 0, pt.from[1]);
    const b = new THREE.Vector3(pt.to[0], 0, pt.to[1]);
    const len = a.distanceTo(b);
    const g = box(len, CEILING_H, 0.1, 0.5, 'x');
    const u = b.clone().sub(a).normalize();
    const m = new THREE.Matrix4().makeBasis(u, new THREE.Vector3(0, 1, 0), new THREE.Vector3(-u.z, 0, u.x));
    g.applyMatrix4(m);
    g.translate((a.x + b.x) / 2, FLOOR_Y + CEILING_H / 2, (a.z + b.z) / 2);
    ctx.b.add(shell ? 'osb' : 'lining', g);
  }

  for (const room of p.rooms) {
    const r = rectOf(room);
    const cx = (r[0] + r[2]) / 2;
    const cz = (r[1] + r[3]) / 2;
    const power = room.kind === 'rest' ? 1 : room.kind === 'steam' ? 0.6 : 0.5;
    ctx.roomLights.push({ pos: new THREE.Vector3(cx, CEIL - 0.25, cz), power });
    if (shell) continue;
    if (room.kind === 'steam') buildSteamRoom(ctx, r);
    if (room.kind === 'rest') buildRestRoom(ctx, room);
  }
  if (!shell) buildHeater(ctx);
}

/* ---------------------------------------------------------------- steam room */

function buildSteamRoom(ctx: HouseCtx, r: Rect) {
  const { c } = ctx;
  // benches along the back wall (z = r[1]), two tiers
  const x0 = r[0] + 0.02;
  const x1 = r[2] - 0.02;
  const len = x1 - x0;
  const tiers = [
    { y: FLOOR_Y + 1.0, d0: 0.0, d1: 0.62 },
    { y: FLOOR_Y + 0.55, d0: 0.62, d1: 1.05 },
  ];
  for (const t of tiers) {
    for (let d = t.d0 + 0.01; d < t.d1 - 0.02; d += 0.095) {
      const g = extrude(boardProfile(0.085, 0.028, 0.006), len, { uOffset: ctx.rnd(), vOffset: ctx.rnd(), uSize: 1, vSize: 0.25 });
      const m = new THREE.Matrix4().set(1, 0, 0, x0, 0, 0, 1, t.y - 0.028, 0, -1, 0, r[1] + d + 0.0425, 0, 0, 0, 1);
      ctx.b.add('bench', g, m);
    }
    // apron
    const ap = box(len, 0.12, 0.022, 1, 'x');
    ap.translate(x0 + len / 2, t.y - 0.09, r[1] + t.d1 - 0.01);
    ctx.b.add('bench', ap);
    // legs
    for (let x = x0 + 0.1; x < x1; x += 0.8) {
      const leg = box(0.045, t.y - FLOOR_Y - 0.03, 0.07);
      leg.translate(x, FLOOR_Y + (t.y - FLOOR_Y - 0.03) / 2, r[1] + t.d1 - 0.08);
      ctx.b.add('bench', leg);
    }
    if (c.benchLight) {
      const led = box(len - 0.1, 0.008, 0.012);
      led.translate(x0 + len / 2, t.y - 0.155, r[1] + t.d1 - 0.035);
      ctx.b.add('led', led);
    }
  }
  // backrest slats
  for (let k = 0; k < 2; k++) {
    const g = box(len, 0.07, 0.02, 1, 'x');
    g.translate(x0 + len / 2, FLOOR_Y + 1.3 + k * 0.18, r[1] + 0.03);
    ctx.b.add('bench', g);
  }
}

function buildHeater(ctx: HouseCtx) {
  const { p, c } = ctx;
  const [x, z] = p.stove.at;
  const electric = c.stove === 'electric';
  const w = electric ? 0.42 : 0.5;
  const d = electric ? 0.32 : 0.55;
  const h = electric ? 0.7 : 0.82;
  const body = box(w, h, d);
  body.translate(x, FLOOR_Y + 0.08 + h / 2, z - (electric ? 0.1 : 0));
  ctx.b.add(electric ? 'stainless' : 'blackSteel', body);
  // stones: deformed icospheres in the basket
  const stoneGeo = new THREE.IcosahedronGeometry(1, 2);
  const count = electric ? 18 : 34;
  const top = FLOOR_Y + 0.08 + h;
  for (let i = 0; i < count; i++) {
    const g = stoneGeo.clone();
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const k = 0.75 + ctx.rnd() * 0.5;
    for (let v = 0; v < pos.count; v++) {
      const n = 1 + (Math.sin(pos.getX(v) * 5 + i) * Math.cos(pos.getY(v) * 4 - i) * 0.12);
      pos.setXYZ(v, pos.getX(v) * n * k, pos.getY(v) * n * 0.7, pos.getZ(v) * n);
    }
    g.computeVertexNormals();
    const s = 0.05 + ctx.rnd() * 0.03;
    g.scale(s, s, s);
    g.rotateY(ctx.rnd() * 6);
    g.translate(x + (ctx.rnd() - 0.5) * (w - 0.1), top + 0.03 + ctx.rnd() * 0.12, z + (ctx.rnd() - 0.5) * (d - 0.1));
    ctx.b.add('gabbro', g);
  }
  if (c.stove === 'wood_glass') {
    // closed heater: steel mesh cage around the stones
    const cage = new THREE.CylinderGeometry(0.28, 0.28, 0.25, 24, 1, true);
    cage.translate(x, top + 0.12, z);
    ctx.b.add('blackSteel', cage);
  }
  if (!electric) {
    const pipe = new THREE.CylinderGeometry(0.06, 0.06, CEIL - top - 0.1, 32, 1, true);
    pipe.translate(x, (top + 0.1 + CEIL) / 2, z);
    ctx.b.add('stainless', pipe);
  }
  if (c.saltWall) {
    // glowing salt bricks on the side wall next to the heater
    const steam = p.rooms.find((r) => r.kind === 'steam')!;
    const r = rectOf(steam);
    const sx = Math.abs(x - r[0]) < Math.abs(x - r[2]) ? r[0] + 0.02 : r[2] - 0.02;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 4; col++) {
        const g = box(0.04, 0.095, 0.195);
        g.translate(sx, FLOOR_Y + 0.6 + row * 0.1, z - 0.6 + col * 0.2 + (row % 2) * 0.1);
        ctx.b.add('salt', g);
      }
    }
  }
}

/* ---------------------------------------------------------------- rest room */

function buildRestRoom(ctx: HouseCtx, room: Room) {
  const r = rectOf(room);
  const cx = (r[0] + r[2]) / 2;
  const cz = (r[1] + r[3]) / 2;
  const alongX = r[2] - r[0] > r[3] - r[1];
  // table and two benches
  const tl = 1.4;
  const tw = 0.75;
  const top = box(alongX ? tl : tw, 0.04, alongX ? tw : tl, 1, alongX ? 'x' : 'z');
  top.translate(cx, FLOOR_Y + 0.74, cz);
  ctx.b.add('thermo', top);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(0.05, 0.72, 0.05);
      const dx = alongX ? sx * (tl / 2 - 0.1) : sx * (tw / 2 - 0.08);
      const dz = alongX ? sz * (tw / 2 - 0.08) : sz * (tl / 2 - 0.1);
      leg.translate(cx + dx, FLOOR_Y + 0.36, cz + dz);
      ctx.b.add('blackSteel', leg);
    }
  }
  for (const side of [-1, 1]) {
    const seat = box(alongX ? tl : 0.36, 0.045, alongX ? 0.36 : tl, 1, alongX ? 'x' : 'z');
    const off = side * (tw / 2 + 0.28);
    seat.translate(cx + (alongX ? 0 : off), FLOOR_Y + 0.45, cz + (alongX ? off : 0));
    ctx.b.add('thermo', seat);
    for (const e of [-1, 1]) {
      const leg = box(alongX ? 0.05 : 0.3, 0.43, alongX ? 0.3 : 0.05);
      const along = e * (tl / 2 - 0.12);
      leg.translate(cx + (alongX ? along : off), FLOOR_Y + 0.215, cz + (alongX ? off : along));
      ctx.b.add('blackSteel', leg);
    }
  }
  // pendant lamp over the table
  const cord = new THREE.CylinderGeometry(0.004, 0.004, 0.75, 6);
  cord.translate(cx, CEIL - 0.375, cz);
  ctx.b.add('blackSteel', cord);
  const shade = new THREE.CylinderGeometry(0.06, 0.18, 0.16, 32, 1, true);
  shade.translate(cx, CEIL - 0.82, cz);
  ctx.b.add('blackSteel', shade);
  const bulb = new THREE.SphereGeometry(0.045, 16, 12);
  bulb.translate(cx, CEIL - 0.86, cz);
  ctx.b.add('ledCool', bulb);
  // cove LED line along the ceiling of every rest-room rectangle
  for (const rr of room.rects) {
    const g = box(rr[2] - rr[0] - 0.3, 0.01, 0.02);
    g.translate((rr[0] + rr[2]) / 2, CEIL - 0.01, rr[1] + 0.12);
    ctx.b.add('ledCool', g);
  }
}
