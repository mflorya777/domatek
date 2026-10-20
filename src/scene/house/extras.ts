/** Optional extras: cedar hot tub (furako) with its heater, terrace lounge furniture. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { boardProfile, box, extrude, flipWinding } from '../geometry';
import type { HouseCtx } from './context';
import { DECK_TOP } from './base';

export function buildFurako(ctx: HouseCtx) {
  const [cx, cz] = ctx.p.furako;
  const R = 0.9;
  const H = 1.0;
  const y0 = 0.05;
  const staves = 52;
  const t = 0.045;
  const w = (2 * Math.PI * R) / staves;
  for (let i = 0; i < staves; i++) {
    const a = (i / staves) * Math.PI * 2;
    const g = extrude(boardProfile(w + 0.002, t, 0.004), H, { uOffset: ctx.rnd(), vOffset: ctx.rnd() });
    // X = height, Y = tangential width, Z = thickness (outward)
    g.rotateZ(Math.PI / 2);
    g.translate(0, y0, R - t);
    g.rotateY(a);
    g.translate(cx, 0, cz);
    ctx.b.add('cedar', g);
  }
  // inner liner and rim
  const liner = new THREE.CylinderGeometry(R - t, R - t, H - 0.05, 64, 1, true).toNonIndexed();
  flipWinding(liner);
  const ln = liner.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < ln.count; i++) ln.setXYZ(i, -ln.getX(i), -ln.getY(i), -ln.getZ(i));
  liner.translate(cx, y0 + (H - 0.05) / 2 + 0.05, cz);
  ctx.b.add('cedar', liner);
  const rim = new THREE.RingGeometry(R - t - 0.02, R + 0.02, 72, 1);
  rim.rotateX(-Math.PI / 2);
  rim.translate(cx, y0 + H + 0.001, cz);
  ctx.b.add('cedar', rim);
  for (const hy of [0.18, H - 0.2]) {
    const hoop = new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.05, 72, 1, true);
    hoop.translate(cx, y0 + hy, cz);
    ctx.b.add('blackSteel', hoop);
  }
  // water
  const water = new THREE.Mesh(new THREE.CircleGeometry(R - t - 0.005, 64), ctx.mats.std.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, y0 + H - 0.14, cz);
  water.userData.noAO = true;
  ctx.add(water);
  const nm = ctx.mats.std.water.normalMap!;
  ctx.updaters.push((tt) => nm.offset.set(tt * 0.01, tt * 0.013));
  // integrated stove: a steel body inside, chimney beside the rim
  const sa = Math.PI * 0.75;
  const sx = cx + Math.cos(sa) * (R - 0.25);
  const sz = cz + Math.sin(sa) * (R - 0.25);
  const body = new THREE.CylinderGeometry(0.17, 0.17, 0.7, 32);
  body.translate(sx, y0 + 0.4, sz);
  ctx.b.add('blackSteel', body);
  const pipe = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 32, 1, true);
  pipe.translate(sx, y0 + H + 0.6, sz);
  ctx.b.add('stainless', pipe);
  const cap = new THREE.ConeGeometry(0.12, 0.08, 32, 1, true);
  cap.translate(sx, y0 + H + 1.48, sz);
  ctx.b.add('stainless', cap);
  // two-step cedar stairs
  const da = -Math.PI * 0.25;
  const dir = new THREE.Vector3(Math.cos(da), 0, Math.sin(da));
  for (let k = 0; k < 2; k++) {
    const st = box(0.7, 0.04, 0.3, 1, 'x');
    const d = R + 0.18 + k * 0.3;
    st.rotateY(-da + Math.PI / 2);
    st.translate(cx + dir.x * d, 0.62 - k * 0.3, cz + dir.z * d);
    ctx.b.add('cedar', st);
    for (const e of [-1, 1]) {
      const leg = box(0.04, 0.62 - k * 0.3, 0.26);
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(e * 0.3);
      leg.rotateY(-da + Math.PI / 2);
      leg.translate(cx + dir.x * d + side.x, (0.62 - k * 0.3) / 2, cz + dir.z * d + side.z);
      ctx.b.add('cedar', leg);
    }
  }
}

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
