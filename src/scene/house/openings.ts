/**
 * Opening units: window and door frames with sashes and glass, casings that close the cladding cut,
 * interior reveals, and the stove firebox portal with a live flame.
 */
import * as THREE from 'three';
import type { Opening } from '../../data/projects';
import { FLOOR_Y, WALL_T } from '../../data/projects';
import { box, quad } from '../geometry';
import type { HouseCtx, WallFrame } from './context';
import type { R2 } from './walls';
import { createFireMaterial } from './fire';

const CF = 0.05;

/** Rectangular ring of boxes around an inner rectangle. */
function ring(
  ctx: HouseCtx, m: THREE.Matrix4, key: string,
  r: R2, face: number, n0: number, n1: number, sides: { bottom?: boolean } = {},
) {
  const d = n1 - n0;
  const nc = (n0 + n1) / 2;
  const w = r.s1 - r.s0;
  const h = r.y1 - r.y0;
  const top = box(w + 2 * face, face, d);
  top.translate((r.s0 + r.s1) / 2, r.y1 + face / 2, nc);
  ctx.b.add(key, top, m);
  if (sides.bottom !== false) {
    const bot = box(w + 2 * face, face, d);
    bot.translate((r.s0 + r.s1) / 2, r.y0 - face / 2, nc);
    ctx.b.add(key, bot, m);
  }
  for (const s of [r.s0 - face / 2, r.s1 + face / 2]) {
    const side = box(face, h, d);
    side.translate(s, (r.y0 + r.y1) / 2, nc);
    ctx.b.add(key, side, m);
  }
}

const inset = (r: R2, d: number, bottom = true): R2 => ({ s0: r.s0 + d, s1: r.s1 - d, y0: r.y0 + (bottom ? d : 0), y1: r.y1 - d });

function glassPane(ctx: HouseCtx, m: THREE.Matrix4, r: R2, n: number) {
  const g = quad(r.s1 - r.s0 + 0.01, r.y1 - r.y0 + 0.01);
  g.translate((r.s0 + r.s1) / 2, (r.y0 + r.y1) / 2, n);
  ctx.b.add('glass', g, m);
}

/** Interior reveal (pine) from the room face to the frame. */
function interiorReveal(ctx: HouseCtx, m: THREE.Matrix4, r: R2, nFrame: number, withSill: boolean) {
  const key = ctx.c.package === 'shell' ? 'osb' : 'lining';
  const depth = WALL_T + nFrame; // nFrame is negative
  const nc = -WALL_T + depth / 2;
  const t = 0.018;
  const top = box(r.s1 - r.s0, t, depth, 0.5);
  top.translate((r.s0 + r.s1) / 2, r.y1 + t / 2, nc);
  ctx.b.add(key, top, m);
  for (const s of [r.s0 - t / 2, r.s1 + t / 2]) {
    const side = box(t, r.y1 - r.y0, depth, 0.5, 'y');
    side.translate(s, (r.y0 + r.y1) / 2, nc);
    ctx.b.add(key, side, m);
  }
  if (withSill) {
    const sill = box(r.s1 - r.s0 + 0.08, 0.03, depth + 0.05, 0.5);
    sill.translate((r.s0 + r.s1) / 2, r.y0 - 0.015, nc - 0.025);
    ctx.b.add(key, sill, m);
  }
}

export function buildOpening(ctx: HouseCtx, wf: WallFrame, o: Opening, r: R2) {
  const m = wf.matrix;
  switch (o.kind) {
    case 'window':
    case 'panorama': {
      const face = o.kind === 'panorama' ? 0.085 : 0.07;
      // exterior casing: closes the cut cladding and frames the opening
      ring(ctx, m, 'frame', r, face, -0.07, CF + 0.035);
      // outer frame
      ring(ctx, m, 'frame', inset(r, 0.065), 0.065, -0.14, -0.07);
      if (o.kind === 'window') {
        // tilt & turn sash
        ring(ctx, m, 'frame', inset(r, 0.12), 0.055, -0.145, -0.08);
        glassPane(ctx, m, inset(r, 0.12), -0.11);
      } else {
        glassPane(ctx, m, inset(r, 0.065), -0.105);
      }
      // exterior sill (drip) under the window
      const sill = box(r.s1 - r.s0 + 2 * face + 0.02, 0.012, CF + 0.09);
      sill.translate((r.s0 + r.s1) / 2, r.y0 - face - 0.006, (CF + 0.09) / 2 - 0.02);
      ctx.b.add('frame', sill, m);
      interiorReveal(ctx, m, r, -0.14, o.sill > 0.2);
      break;
    }
    case 'door': {
      const face = 0.075;
      ring(ctx, m, 'frame', r, face, -0.07, CF + 0.035, { bottom: false });
      const fr: R2 = { ...r, y0: r.y0 + 0.02 };
      // frame (three sides) and threshold
      ring(ctx, m, 'frame', { ...inset(fr, 0.07, false) }, 0.07, -0.14, -0.07, { bottom: false });
      const thr = box(r.s1 - r.s0, 0.02, 0.22);
      thr.translate((r.s0 + r.s1) / 2, r.y0 + 0.01, -0.06);
      ctx.b.add('stainless', thr, m);
      // leaf with full-height glass
      const leaf: R2 = { s0: r.s0 + 0.075, s1: r.s1 - 0.075, y0: r.y0 + 0.025, y1: r.y1 - 0.075 };
      const stile = 0.095;
      const t0 = -0.135;
      const t1 = -0.075;
      const nc = (t0 + t1) / 2;
      const lw = leaf.s1 - leaf.s0;
      const lh = leaf.y1 - leaf.y0;
      for (const s of [leaf.s0 + stile / 2, leaf.s1 - stile / 2]) {
        const g = box(stile, lh, t1 - t0);
        g.translate(s, (leaf.y0 + leaf.y1) / 2, nc);
        ctx.b.add('frame', g, m);
      }
      const topRail = box(lw, stile, t1 - t0);
      topRail.translate((leaf.s0 + leaf.s1) / 2, leaf.y1 - stile / 2, nc);
      ctx.b.add('frame', topRail, m);
      const botRail = box(lw, 0.16, t1 - t0);
      botRail.translate((leaf.s0 + leaf.s1) / 2, leaf.y0 + 0.08, nc);
      ctx.b.add('frame', botRail, m);
      glassPane(ctx, m, { s0: leaf.s0 + stile, s1: leaf.s1 - stile, y0: leaf.y0 + 0.16, y1: leaf.y1 - stile }, nc);
      // bar handle on standoffs
      const hs = leaf.s1 - stile / 2;
      const bar = new THREE.CylinderGeometry(0.014, 0.014, 0.8, 20);
      bar.translate(hs, FLOOR_Y + 1.05, t1 + 0.065);
      ctx.b.add('blackSteel', bar, m);
      for (const dy of [-0.3, 0.3]) {
        const st = new THREE.CylinderGeometry(0.009, 0.009, 0.065, 12);
        st.rotateX(Math.PI / 2);
        st.translate(hs, FLOOR_Y + 1.05 + dy, t1 + 0.032);
        ctx.b.add('blackSteel', st, m);
      }
      interiorReveal(ctx, m, r, -0.14, false);
      break;
    }
    case 'firebox':
      buildFirebox(ctx, wf, r);
      break;
  }
}

function buildFirebox(ctx: HouseCtx, wf: WallFrame, r: R2) {
  const m = wf.matrix;
  const glassStove = ctx.c.stove === 'wood_glass';
  // heat-shield portal plate
  ring(ctx, m, 'blackSteel', r, 0.13, CF, CF + 0.008);
  // tunnel through the wall
  ring(ctx, m, 'blackSteel', r, 0.006, -WALL_T - 0.1, CF + 0.004);
  const back = quad(r.s1 - r.s0, r.y1 - r.y0);
  back.translate((r.s0 + r.s1) / 2, (r.y0 + r.y1) / 2, -WALL_T - 0.1);
  ctx.b.add('backing', back, m);

  // door: frame, glass, handle
  const door = inset(r, -0.01);
  ring(ctx, m, 'blackSteel', inset(door, 0.04), 0.04, CF + 0.006, CF + 0.03);
  const dg = inset(door, 0.04);
  glassPane(ctx, m, dg, CF + 0.018);
  const handle = new THREE.CylinderGeometry(0.01, 0.01, 0.16, 12);
  handle.translate(door.s1 + 0.035, (r.y0 + r.y1) / 2, CF + 0.055);
  ctx.b.add('stainless', handle, m);
  for (const dy of [-0.06, 0.06]) {
    const st = box(0.03, 0.012, 0.03);
    st.translate(door.s1 + 0.02, (r.y0 + r.y1) / 2 + dy, CF + 0.04);
    ctx.b.add('stainless', st, m);
  }

  // glowing logs and flame
  const logs = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, (r.s1 - r.s0) * 0.8, 12), ctx.mats.std.charcoal);
    g.rotation.z = Math.PI / 2;
    g.rotation.y = (i - 1) * 0.35;
    g.position.set((r.s0 + r.s1) / 2, r.y0 + 0.05 + (i === 1 ? 0.06 : 0), -0.05 - i * 0.04);
    logs.add(g);
  }
  logs.applyMatrix4(m);
  ctx.add(logs);

  const fire = createFireMaterial(glassStove ? 1 : 0.85);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(r.s1 - r.s0 - 0.02, r.y1 - r.y0 - 0.02), fire.material);
  plane.position.set((r.s0 + r.s1) / 2, (r.y0 + r.y1) / 2, -0.03);
  plane.applyMatrix4(m);
  plane.userData.noAO = true;
  ctx.add(plane);
  ctx.updaters.push(fire.update);

  const light = new THREE.PointLight(0xff8a3c, 0, 3.5, 2);
  light.position.set((r.s0 + r.s1) / 2, (r.y0 + r.y1) / 2, CF + 0.35).applyMatrix4(m);
  light.userData = { day: 0.6, night: 2.8, flicker: true };
  ctx.add(light);
}
