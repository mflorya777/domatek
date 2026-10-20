/** Optional extras: terrace lounge furniture. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { HouseCtx } from './context';
import { DECK_TOP } from './base';

/** A lounge armchair (steel frame, woven-look cushions) and a side table. */
export function buildFurniture(ctx: HouseCtx) {
  const deckOn = ctx.p.id !== 'nord' || ctx.c.deck;
  if (!deckOn) return;
  for (const f of ctx.p.furniture) {
    const g = new THREE.Group();
    const frameMat = ctx.mats.std.blackSteel;
    const cushion = ctx.mats.std.cushion;
    const chair = (dx: number, rot: number) => {
      const c = new THREE.Group();
      const tube = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(new RoundedBoxGeometry(sx, sy, sz, 2, 0.008), frameMat);
        m.position.set(x, y, z);
        m.castShadow = true;
        c.add(m);
      };
      // side frames
      for (const s of [-0.36, 0.36]) {
        tube(0.03, 0.03, 0.72, s, 0.02, 0);
        tube(0.03, 0.03, 0.72, s, 0.58, 0.02);
        tube(0.03, 0.58, 0.03, s, 0.3, 0.33);
        tube(0.03, 0.58, 0.03, s, 0.3, -0.33);
      }
      tube(0.72, 0.025, 0.025, 0, 0.3, 0.33);
      tube(0.72, 0.025, 0.025, 0, 0.3, -0.33);
      const seat = new THREE.Mesh(new RoundedBoxGeometry(0.68, 0.13, 0.66, 4, 0.04), cushion);
      seat.position.set(0, 0.36, 0.01);
      const back = new THREE.Mesh(new RoundedBoxGeometry(0.68, 0.5, 0.13, 4, 0.04), cushion);
      back.position.set(0, 0.62, -0.25);
      back.rotation.x = -0.22;
      for (const m of [seat, back]) {
        m.castShadow = m.receiveShadow = true;
        c.add(m);
      }
      c.position.x = dx;
      c.rotation.y = rot;
      g.add(c);
    };
    if (f.chairs === 2) {
      chair(-0.48, 0.25);
      chair(0.48, -0.25);
    } else chair(0, 0);
    const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 48), frameMat);
    tableTop.position.set(0, 0.46, 0.55);
    const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 16), frameMat);
    tableLeg.position.set(0, 0.23, 0.55);
    const tableBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 32), frameMat);
    tableBase.position.set(0, 0.006, 0.55);
    for (const m of [tableTop, tableLeg, tableBase]) {
      m.castShadow = true;
      g.add(m);
    }
    g.position.set(f.at[0], DECK_TOP, f.at[1]);
    g.rotation.y = f.rot;
    ctx.add(g);
  }
}
