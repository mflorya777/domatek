/**
 * Exterior walls: board-by-board cladding cut around openings, profiled steel sheet with real ribs,
 * corner and joint flashings, interior lining and the opening units.
 */
import * as THREE from 'three';
import { activeOpenings, claddingZones } from '../../data/metrics';
import { CEILING_H, CLAD_BOTTOM, FLOOR_Y, WALL_T, WALL_TOP, type Opening } from '../../data/projects';
import { boardProfile, box, extrude, freeIntervals, quad, type Interval, type P2 } from '../geometry';
import { wallFrame, type HouseCtx, type WallFrame } from './context';
import { buildOpening } from './openings';

/** Distance from the sheathing plane to the front of the cladding. */
export const CF = 0.05;
const WOOD_N0 = 0.026;
const BOARD_T = 0.021;
const METAL_N0 = 0.03;

export interface R2 {
  s0: number;
  s1: number;
  y0: number;
  y1: number;
}

/** Split a rectangle minus holes into rectangles (column decomposition). */
export function regions(area: R2, holes: R2[]): R2[] {
  const xs = new Set<number>([area.s0, area.s1]);
  for (const h of holes) {
    if (h.s1 <= area.s0 || h.s0 >= area.s1) continue;
    xs.add(Math.max(area.s0, h.s0));
    xs.add(Math.min(area.s1, h.s1));
  }
  const sorted = [...xs].sort((a, b) => a - b);
  const out: R2[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b - a < 1e-4) continue;
    const mid = (a + b) / 2;
    const blocked = holes.filter((h) => h.s0 < mid && h.s1 > mid).map((h) => [h.y0, h.y1] as Interval);
    for (const [y0, y1] of freeIntervals(area.y0, area.y1, blocked, 1e-4)) out.push({ s0: a, s1: b, y0, y1 });
  }
  return out;
}

/**
 * Lay boards in rows (horizontal) over an area with holes.
 * Rows partially covered by a hole are cut to the remaining strip, so cladding closes up to openings.
 */
function layRows(area: R2, holes: R2[], pitch: number, gap: number, emit: (r: R2) => void) {
  for (let ya = area.y0; ya < area.y1 - 0.01; ya += pitch) {
    const yb = Math.min(ya + pitch - gap, area.y1);
    const rowHoles = holes.filter((h) => h.y0 < yb && h.y1 > ya && h.s0 < area.s1 && h.s1 > area.s0);
    if (!rowHoles.length) {
      emit({ s0: area.s0, s1: area.s1, y0: ya, y1: yb });
      continue;
    }
    for (const r of regions({ s0: area.s0, s1: area.s1, y0: ya, y1: yb }, rowHoles)) {
      if (r.y1 - r.y0 > 0.012) emit(r);
    }
  }
}

function transpose(r: R2): R2 {
  return { s0: r.y0, s1: r.y1, y0: r.s0, y1: r.s1 };
}

/** Pieces longer than a stock board get butt joints at staggered positions. */
function splitLong(len: number, rnd: () => number, max = 6): Interval[] {
  if (len <= max) return [[0, len]];
  const out: Interval[] = [];
  let a = 0;
  while (len - a > max) {
    const b = a + max * (0.55 + rnd() * 0.4);
    out.push([a, b]);
    a = b;
  }
  out.push([a, len]);
  return out;
}

function boardCladding(
  ctx: HouseCtx, wf: WallFrame, area: R2, holes: R2[], orient: 'h' | 'v',
  key: string, opts: { width: number; gap: number; chamfer: number },
) {
  const { width, gap, chamfer } = opts;
  const pitch = width + gap;
  const m = wf.matrix;
  const emitH = (r: R2) => {
    for (const [a, b] of splitLong(r.s1 - r.s0, ctx.rnd)) {
      const g = extrude(boardProfile(r.y1 - r.y0, BOARD_T, chamfer), b - a, { uOffset: ctx.rnd(), vOffset: ctx.rnd() });
      g.translate(r.s0 + a, (r.y0 + r.y1) / 2, WOOD_N0);
      ctx.b.add(key, g, m);
    }
  };
  const emitV = (r: R2) => {
    const g = extrude(boardProfile(r.s1 - r.s0, BOARD_T, chamfer), r.y1 - r.y0, { uOffset: ctx.rnd(), vOffset: ctx.rnd() });
    g.rotateZ(Math.PI / 2);
    g.translate((r.s0 + r.s1) / 2, r.y0, WOOD_N0);
    ctx.b.add(key, g, m);
  };
  if (orient === 'h') layRows(area, holes, pitch, gap, emitH);
  else layRows(transpose(area), holes.map(transpose), pitch, gap, (r) => emitV(transpose(r)));

  // dark wind membrane behind the boards, visible in the gaps
  for (const r of regions(area, holes)) {
    const g = quad(r.s1 - r.s0, r.y1 - r.y0);
    g.translate((r.s0 + r.s1) / 2, (r.y0 + r.y1) / 2, WOOD_N0 - 0.002);
    ctx.b.add('backing', g, m);
  }
}

/** Trapezoidal steel profile (С20-like): pitch 137.5 mm, rib height 20 mm. */
const RIB = { pitch: 0.1375, h: 0.02, top: 0.03, slope: 0.012 };

function ribHeight(s: number) {
  const t = ((s % RIB.pitch) + RIB.pitch) % RIB.pitch;
  const bottom = RIB.pitch - RIB.top - 2 * RIB.slope;
  if (t < bottom) return 0;
  if (t < bottom + RIB.slope) return ((t - bottom) / RIB.slope) * RIB.h;
  if (t < bottom + RIB.slope + RIB.top) return RIB.h;
  return (1 - (t - bottom - RIB.slope - RIB.top) / RIB.slope) * RIB.h;
}

/** Profile breakpoints between a and b (descending s, so the open profile faces +Z). */
export function ribProfile(a: number, b: number): P2[] {
  const bottom = RIB.pitch - RIB.top - 2 * RIB.slope;
  const marks = [0, bottom, bottom + RIB.slope, bottom + RIB.slope + RIB.top];
  const pts: number[] = [a, b];
  for (let k = Math.floor(a / RIB.pitch) - 1; k * RIB.pitch < b + RIB.pitch; k++) {
    for (const mk of marks) {
      const s = k * RIB.pitch + mk;
      if (s > a && s < b) pts.push(s);
    }
  }
  pts.sort((x, y) => y - x);
  return pts.map((s) => [-s, ribHeight(s)] as P2);
}

function profileCladding(ctx: HouseCtx, wf: WallFrame, area: R2, holes: R2[], key: string) {
  for (const r of regions(area, holes)) {
    const g = extrude(ribProfile(r.s0, r.s1), r.y1 - r.y0, { closed: false, uSize: 1, vSize: 1 });
    g.rotateZ(Math.PI / 2);
    g.translate(0, r.y0, METAL_N0);
    ctx.b.add(key, g, wf.matrix);
  }
}

function liningBoards(ctx: HouseCtx, wf: WallFrame, area: R2, holes: R2[]) {
  // inner face at −WALL_T, boards facing into the room (−Z)
  const flip = new THREE.Matrix4().makeScale(1, 1, -1);
  const m = wf.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -WALL_T)).multiply(flip);
  layRows(area, holes, 0.096, 0.003, (r) => {
    const g = extrude(boardProfile(r.y1 - r.y0, 0.014, 0.004), r.s1 - r.s0, { uOffset: ctx.rnd(), vOffset: ctx.rnd() });
    g.translate(r.s0, (r.y0 + r.y1) / 2, 0);
    ctx.b.add('lining', g, m);
  });
}

export function openingRect(o: Opening): R2 {
  return { s0: o.at - o.w / 2, s1: o.at + o.w / 2, y0: FLOOR_Y + o.sill, y1: FLOOR_Y + o.sill + o.h };
}

export function buildWalls(ctx: HouseCtx) {
  const { p, c } = ctx;
  p.walls.forEach((w, i) => {
    const wf = wallFrame(ctx, i);
    const openings = activeOpenings(w, c);
    const holes = openings.map(openingRect);
    const s0 = wf.startConvex ? -CF : CF;
    const s1 = wf.len + (wf.endConvex ? CF : -CF);
    const zones = claddingZones(w);

    zones.forEach((z) => {
      const area: R2 = {
        s0: z.from <= 0.001 ? s0 : z.from,
        s1: z.to >= wf.len - 0.001 ? s1 : z.to,
        y0: CLAD_BOTTOM,
        y1: WALL_TOP,
      };
      if (z.zone === 'warm') {
        boardCladding(ctx, wf, area, holes, c.warmOrientation, 'warm', {
          width: c.warmOrientation === 'h' ? 0.142 : 0.118,
          gap: c.warmOrientation === 'h' ? 0.004 : 0.007,
          chamfer: 0.005,
        });
      } else if (c.accentMaterial === 'profile') {
        profileCladding(ctx, wf, area, holes, 'accentMetal');
      } else {
        boardCladding(ctx, wf, area, holes, 'v', 'accentWood', { width: 0.115, gap: 0.009, chamfer: 0.006 });
      }
      // joint flashing between two zones inside one wall
      if (z.to < wf.len - 0.001) {
        const g = box(0.05, WALL_TOP - CLAD_BOTTOM, 0.012);
        g.translate(z.to, (WALL_TOP + CLAD_BOTTOM) / 2, CF + 0.004);
        ctx.b.add('trim', g, wf.matrix);
      }
    });

    // corner flashings (L-angle on convex corners, square bar in concave corners)
    const hgt = WALL_TOP - CLAD_BOTTOM + 0.01;
    const yc = (WALL_TOP + CLAD_BOTTOM) / 2;
    if (wf.startConvex) {
      const g = box(0.012, hgt, 0.07);
      g.translate(-CF - 0.006, yc, CF - 0.035 + 0.012);
      ctx.b.add('trim', g, wf.matrix);
      const g2 = box(0.07, hgt, 0.012);
      g2.translate(-CF + 0.035 - 0.012, yc, CF + 0.006);
      ctx.b.add('trim', g2, wf.matrix);
    } else {
      const g = box(0.05, hgt, 0.05);
      g.translate(CF / 2, yc, CF / 2);
      ctx.b.add('trim', g, wf.matrix);
    }

    // drip flashing at the bottom of the cladding
    const drip = box(s1 - s0 + (wf.startConvex ? 0.012 : 0) + (wf.endConvex ? 0.012 : 0), 0.05, 0.075);
    drip.translate((s0 + s1) / 2, CLAD_BOTTOM - 0.005, CF - 0.03);
    ctx.b.add('trim', drip, wf.matrix);

    // interior lining (skipped for the shell package — bare OSB look is not worth modelling)
    const li0 = wf.startConvex ? WALL_T : -WALL_T;
    const li1 = wf.len + (wf.endConvex ? -WALL_T : WALL_T);
    const liningArea: R2 = { s0: li0, s1: li1, y0: FLOOR_Y, y1: FLOOR_Y + CEILING_H };
    const roomKey = c.package === 'shell' ? 'osb' : 'lining';
    if (roomKey === 'lining') liningBoards(ctx, wf, liningArea, holes);
    else {
      for (const r of regions(liningArea, holes)) {
        const g = quad(r.s1 - r.s0, r.y1 - r.y0, 1.2);
        g.rotateY(Math.PI);
        g.translate((r.s0 + r.s1) / 2, (r.y0 + r.y1) / 2, -WALL_T);
        ctx.b.add('osb', g, wf.matrix);
      }
    }

    // structural core visible from nowhere but closes the wall top for shadows
    const top = box(wf.len, 0.02, WALL_T);
    top.translate(wf.len / 2, WALL_TOP - 0.01, -WALL_T / 2);
    ctx.b.add('backing', top, wf.matrix);

    for (const o of openings) buildOpening(ctx, wf, o, openingRect(o));

    // wall lights
    for (const at of w.lamps ?? []) {
      const blocked = holes.some((h) => at > h.s0 - 0.12 && at < h.s1 + 0.12);
      if (blocked) continue;
      buildLamp(ctx, wf, at, FLOOR_Y + 2.05);
    }
  });
}

function buildLamp(ctx: HouseCtx, wf: WallFrame, at: number, y: number) {
  const body = box(0.085, 0.17, 0.1);
  body.translate(at, y, CF + 0.05);
  ctx.b.add('blackSteel', body, wf.matrix);
  for (const dy of [-1, 1]) {
    const glow = box(0.06, 0.004, 0.06);
    glow.translate(at, y + dy * 0.087, CF + 0.05);
    ctx.b.add('lampGlow', glow, wf.matrix);
  }
  const pos = new THREE.Vector3(at, y, CF + 0.12).applyMatrix4(wf.matrix);
  ctx.lamps.push({ pos, normal: wf.n.clone() });
}
