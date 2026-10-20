/**
 * Site around the sauna: anti-tiled lawn, gravel bed with steel edging, stepping stones, instanced grass,
 * shrubs and ferns, procedural birches and pines, and a lake in the background.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { HouseModel } from './house';
import { rng } from './geometry';
import type { Materials } from './materials';

export const LAKE = { x: -48, z: -105, r: 68 };

export interface Landscape {
  group: THREE.Group;
  /** Re-fit the gravel bed, path and grass to a new house. */
  fitHouse(h: HouseModel): void;
  update(t: number): void;
  setTrees(v: boolean): void;
  setQuality(q: 'high' | 'low'): void;
  loadVegetation(manager: THREE.LoadingManager): Promise<void>;
  growTrees(): Promise<void>;
}

/* ---------------------------------------------------------------- ground */

function groundMaterial(mats: Materials) {
  const grass = mats.tex('tex/grass/color.webp', true);
  const dirt = mats.tex('tex/ground/color.webp', true);
  const grassN = mats.tex('tex/grass/normal.webp');
  const m = new THREE.MeshStandardMaterial({ map: grass, normalMap: grassN, roughness: 0.96, color: 0xffffff });
  m.normalScale.set(0.6, 0.6);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tDirt = { value: dirt };
    sh.uniforms.uLake = { value: new THREE.Vector3(LAKE.x, LAKE.z, LAKE.r) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGround;
        uniform sampler2D tDirt;
        uniform vec3 uLake;
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
        }
        float gFbm(vec2 p) { return gNoise(p) * 0.55 + gNoise(p * 2.1) * 0.3 + gNoise(p * 4.3) * 0.15; }`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec2 wp = vGround.xz;
          float c = cos(0.7), s = sin(0.7);
          vec3 g1 = texture2D(map, wp / 2.7).rgb;
          vec3 g2 = texture2D(map, mat2(c, -s, s, c) * wp / 6.1).rgb;
          vec3 d1 = texture2D(tDirt, wp / 3.3).rgb;
          float macro = gFbm(wp * 0.045);
          float patchy = gFbm(wp * 0.21 + 7.0);
          vec3 grass = mix(g1, g2, 0.45 + 0.3 * (macro - 0.5));
          // lighter dry patches and greener hollows
          grass *= mix(vec3(0.82, 0.86, 0.72), vec3(1.08, 1.04, 0.92), macro);
          float dirtAmt = smoothstep(0.62, 0.82, patchy) * 0.55;
          // wet, darker soil towards the lake shore
          float shore = 1.0 - smoothstep(uLake.z, uLake.z + 6.0, distance(wp, uLake.xy));
          dirtAmt = max(dirtAmt, shore);
          vec3 col = mix(grass, d1 * vec3(0.8, 0.78, 0.74), dirtAmt);
          diffuseColor.rgb *= col;
        }`,
      );
  };
  return m;
}

/* ---------------------------------------------------------------- grass blades */

function clumpGeometry(seed: number) {
  const r = rng(seed);
  const blades = 12;
  const segs = 4;
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 0.16;
    const bx = Math.cos(a) * d;
    const bz = Math.sin(a) * d;
    const h = 0.07 + r() * 0.12;
    const w = 0.006 + r() * 0.004;
    const facing = r() * Math.PI * 2;
    const fx = Math.cos(facing);
    const fz = Math.sin(facing);
    const bend = 0.02 + r() * 0.06;
    const tint = 0.85 + r() * 0.3;
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = h * t;
      const off = bend * t * t;
      const ww = w * (1 - t * 0.92);
      const cx = bx + fz * off;
      const cz = bz - fx * off;
      pos.push(cx - fx * ww, y, cz - fz * ww, cx + fx * ww, y, cz + fz * ww);
      // normals lean up so blades read as a soft lawn rather than ribbons
      const n = new THREE.Vector3(fz, 1.6, -fx).normalize();
      nor.push(n.x, n.y, n.z, n.x, n.y, n.z);
      const shade = (0.35 + 0.65 * t) * tint;
      col.push(shade * 0.62, shade * 0.85, shade * 0.36, shade * 0.62, shade * 0.85, shade * 0.36);
      if (i < segs) {
        const k = base + i * 2;
        idx.push(k, k + 1, k + 3, k, k + 3, k + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function grassMaterial(time: { value: number }) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: 0x6f8a4a,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          float k = position.y * position.y * 40.0;
          float w = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.22) * 0.5 + sin(uTime * 2.9 + ip.x * 0.9) * 0.25;
          transformed.x += w * k * 0.06;
          transformed.z += w * k * 0.03;
        }`,
      );
  };
  return m;
}

/* ---------------------------------------------------------------- stepping stones */

function stoneGeometry(r: () => number) {
  const pts: THREE.Vector2[] = [];
  const n = 28;
  const rx = 0.28 + r() * 0.08;
  const rz = 0.2 + r() * 0.06;
  const ph = r() * 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + Math.sin(a * 3 + ph) * 0.06 + Math.sin(a * 5 + ph * 2) * 0.04;
    pts.push(new THREE.Vector2(Math.cos(a) * rx * k, Math.sin(a) * rz * k));
  }
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 3,
  });
  g.rotateX(-Math.PI / 2);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.9 + ph, uv.getY(i) * 0.9);
  return g;
}

/* ---------------------------------------------------------------- landscape */

export function createLandscape(mats: Materials): Landscape {
  const group = new THREE.Group();
  const time = { value: 0 };

  const ground = new THREE.Mesh(new THREE.CircleGeometry(420, 96), groundMaterial(mats));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // lake
  const waterNormal = mats.tex('tex/waternormals.jpg');
  waterNormal.repeat.set(18, 18);
  const lakeMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a2e33,
    roughness: 0.06,
    metalness: 0,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 1.35,
    specularIntensity: 1,
  });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 96), lakeMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(LAKE.x, 0.03, LAKE.z);
  lake.userData.noAO = true;
  group.add(lake);

  const gravelMat = new THREE.MeshStandardMaterial({
    map: mats.tex('tex/gen/gravel_color.webp', true),
    normalMap: mats.tex('tex/gen/gravel_normal.webp'),
    roughnessMap: mats.tex('tex/gen/gravel_rough.webp'),
    roughness: 1,
  });
  gravelMat.normalScale.set(1.2, 1.2);
  const stoneMat = new THREE.MeshStandardMaterial({
    map: mats.tex('tex/concrete/color.webp', true),
    normalMap: mats.tex('tex/concrete/normal.webp'),
    color: 0x9b9893,
    roughness: 0.88,
  });

  let siteGroup = new THREE.Group();
  group.add(siteGroup);
  let grassMesh: THREE.InstancedMesh | null = null;
  const grassMat = grassMaterial(time);
  const clump = clumpGeometry(7);
  let quality: 'high' | 'low' = 'high';
  let lastHouse: HouseModel | null = null;

  const vegetation = new THREE.Group();
  group.add(vegetation);
  const veg: Record<string, THREE.Object3D> = {};
  const trees = new THREE.Group();
  group.add(trees);
  const treeUpdaters: ((t: number) => void)[] = [];

  function fitHouse(h: HouseModel) {
    lastHouse = h;
    group.remove(siteGroup);
    siteGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    siteGroup = new THREE.Group();
    group.add(siteGroup);

    // gravel bed with steel edging around the footprint
    const fp = h.footprint;
    const m = 0.55;
    const bed = { x0: fp.min.x - m, z0: fp.min.z - m, x1: fp.max.x + m, z1: fp.max.z + m };
    const bw = bed.x1 - bed.x0;
    const bd = bed.z1 - bed.z0;
    const gg = new THREE.PlaneGeometry(bw, bd);
    const uv = gg.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * bw) / 0.9, (uv.getY(i) * bd) / 0.9);
    const gravel = new THREE.Mesh(gg, gravelMat);
    gravel.rotation.x = -Math.PI / 2;
    gravel.position.set((bed.x0 + bed.x1) / 2, 0.018, (bed.z0 + bed.z1) / 2);
    gravel.receiveShadow = true;
    siteGroup.add(gravel);
    const edgeMat = mats.std.blackSteel;
    const edges: [number, number, number, number][] = [
      [bed.x0, bed.z0, bed.x1, bed.z0],
      [bed.x1, bed.z0, bed.x1, bed.z1],
      [bed.x1, bed.z1, bed.x0, bed.z1],
      [bed.x0, bed.z1, bed.x0, bed.z0],
    ];
    for (const [ax, az, bx, bz] of edges) {
      const len = Math.hypot(bx - ax, bz - az);
      const e = new THREE.Mesh(new THREE.BoxGeometry(len + 0.004, 0.05, 0.004), edgeMat);
      e.position.set((ax + bx) / 2, 0.02, (az + bz) / 2);
      e.rotation.y = -Math.atan2(bz - az, bx - ax);
      e.castShadow = e.receiveShadow = true;
      siteGroup.add(e);
    }

    // stepping stones from the foot of the steps towards the front of the plot
    const stones: THREE.Vector3[] = [];
    if (h.stepFoot) {
      const r = rng(3);
      const p = h.stepFoot.pos.clone();
      const dir = h.stepFoot.dir.clone();
      const toFront = new THREE.Vector3(0.15, 0, 1).normalize();
      for (let i = 0; i < 9; i++) {
        const st = new THREE.Mesh(stoneGeometry(r), stoneMat);
        st.position.set(p.x + (r() - 0.5) * 0.08, 0.0, p.z + (r() - 0.5) * 0.08);
        st.rotation.y = r() * Math.PI;
        st.receiveShadow = st.castShadow = true;
        siteGroup.add(st);
        stones.push(st.position.clone());
        dir.lerp(toFront, 0.28).normalize();
        p.addScaledVector(dir, 0.62 + r() * 0.06);
      }
    }
    placeGrass(bed, stones);
    placeVegetation(bed, stones);
  }

  function placeGrass(bed: { x0: number; z0: number; x1: number; z1: number }, stones: THREE.Vector3[]) {
    if (grassMesh) {
      siteGroup.remove(grassMesh);
      grassMesh.dispose();
    }
    const r = rng(11);
    const max = quality === 'high' ? 15000 : 6000;
    const mesh = new THREE.InstancedMesh(clump, grassMat, max);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.noAO = true;
    const cx = (bed.x0 + bed.x1) / 2;
    const cz = (bed.z0 + bed.z1) / 2;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let n = 0;
    let guard = 0;
    while (n < max && guard++ < max * 4) {
      // denser close to the house, thinning out to ~22 m
      const a = r() * Math.PI * 2;
      const d = 1 + Math.pow(r(), 1.35) * 21;
      const x = cx + Math.cos(a) * d * 1.15;
      const z = cz + Math.sin(a) * d;
      if (x > bed.x0 - 0.05 && x < bed.x1 + 0.05 && z > bed.z0 - 0.05 && z < bed.z1 + 0.05) continue;
      if (stones.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < 0.1)) continue;
      if ((x - LAKE.x) ** 2 + (z - LAKE.z) ** 2 < (LAKE.r + 2) ** 2) continue;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, r() * Math.PI * 2, 0);
      const s = 0.75 + r() * 0.45;
      dummy.scale.set(s, s * (0.7 + r() * 0.6), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      const v = 0.85 + r() * 0.3;
      color.setRGB(v * (0.95 + r() * 0.1), v, v * (0.9 + r() * 0.15));
      mesh.setColorAt(n, color);
      n++;
    }
    mesh.count = n;
    grassMesh = mesh;
    siteGroup.add(mesh);
  }

  function placeVegetation(bed: { x0: number; z0: number; x1: number; z1: number }, stones: THREE.Vector3[]) {
    vegetation.clear();
    if (!veg.shrub_02) return;
    const r = rng(5);
    const spots: { k: string; x: number; z: number; s: number }[] = [];
    const cxm = (bed.x0 + bed.x1) / 2;
    const add = (k: string, x: number, z: number, s: number) => {
      if (stones.some((st) => (st.x - x) ** 2 + (st.z - z) ** 2 < 0.8)) return;
      spots.push({ k, x, z, s });
    };
    // junipers / shrubs hugging the back corners and sides
    add('shrub_02', bed.x0 - 0.7, bed.z0 + 0.4, 0.9);
    add('shrub_03', bed.x1 + 0.8, bed.z0 + 0.8, 1.0);
    add('shrub_04', bed.x1 + 0.7, bed.z1 - 0.6, 0.75);
    add('shrub_03', bed.x0 - 0.8, bed.z1 - 1.6, 0.7);
    add('shrub_04', cxm + 1.5, bed.z0 - 0.9, 0.9);
    add('shrub_02', cxm - 2.4, bed.z0 - 1.1, 1.1);
    // ferns and mossy rocks along the edges
    for (let i = 0; i < 9; i++) {
      const side = i % 3;
      const x = side === 0 ? bed.x0 - 0.45 : side === 1 ? bed.x1 + 0.45 : bed.x0 + r() * (bed.x1 - bed.x0);
      const z = side === 2 ? bed.z0 - 0.45 : bed.z0 + r() * (bed.z1 - bed.z0);
      add('fern_02', x + (r() - 0.5) * 0.3, z, 0.8 + r() * 0.5);
    }
    add('rock_moss_set_01', bed.x1 + 1.6, bed.z1 + 0.6, 0.45);
    add('rock_moss_set_01', bed.x0 - 1.8, bed.z0 - 0.4, 0.5);
    for (const s of spots) {
      const src = veg[s.k];
      if (!src) continue;
      const o = src.clone();
      o.position.set(s.x, 0, s.z);
      o.rotation.y = r() * Math.PI * 2;
      o.scale.setScalar(s.s);
      vegetation.add(o);
    }
    // a few flowers near the stones and edges
    if (veg.flower_white) {
      for (let i = 0; i < 26; i++) {
        const a = r() * Math.PI * 2;
        const d = 1.0 + r() * 3.5;
        const x = (bed.x0 + bed.x1) / 2 + Math.cos(a) * ((bed.x1 - bed.x0) / 2 + d);
        const z = (bed.z0 + bed.z1) / 2 + Math.sin(a) * ((bed.z1 - bed.z0) / 2 + d);
        if (stones.some((st) => (st.x - x) ** 2 + (st.z - z) ** 2 < 0.3)) continue;
        const f = (r() < 0.75 ? veg.flower_white : veg.flower_yellow ?? veg.flower_white).clone();
        f.position.set(x, 0, z);
        f.rotation.y = r() * 6;
        f.scale.setScalar(0.0035 + r() * 0.002);
        vegetation.add(f);
      }
    }
  }

  async function loadVegetation(manager: THREE.LoadingManager) {
    const loader = new GLTFLoader(manager);
    const names = ['shrub_02', 'shrub_03', 'shrub_04', 'fern_02', 'rock_moss_set_01', 'flower_white', 'flower_yellow'];
    await Promise.all(
      names.map(async (n) => {
        try {
          const gl = await loader.loadAsync(`assets/models/${n}.glb`);
          gl.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.castShadow = !n.startsWith('flower');
              o.receiveShadow = true;
              const m = o.material as THREE.MeshStandardMaterial;
              if (m.map) m.map.anisotropy = 4;
              if (m.alphaMap || m.transparent) {
                m.transparent = false;
                m.alphaTest = 0.5;
              }
              o.userData.noAO = n.startsWith('flower') || n.startsWith('fern');
            }
          });
          veg[n] = gl.scene;
        } catch (e) {
          console.warn('vegetation', n, e);
        }
      }),
    );
    if (lastHouse) fitHouse(lastHouse);
  }

  /** Procedural birches and pines (ez-tree), built after the first frame so the page stays responsive. */
  async function growTrees() {
    const { Tree } = await import('@dgreenheck/ez-tree');
    const r = rng(21);
    const variants: { group: THREE.Group; height: number }[] = [];
    const make = (preset: string, seed: number, height: number, birch: boolean) => {
      const t = new Tree();
      t.loadPreset(preset);
      t.options.seed = seed;
      if (birch) {
        t.options.bark.type = 'birch';
        t.options.leaves.tint = 0xd8e8b0;
      }
      t.generate();
      // PBR bark instead of the library's phong material
      const bm = t.branchesMesh.material as THREE.MeshPhongMaterial;
      t.branchesMesh.material = new THREE.MeshStandardMaterial({
        map: bm.map,
        normalMap: bm.normalMap,
        aoMap: bm.aoMap,
        roughness: 0.95,
        color: birch ? 0xf2f0ea : 0xbdb0a2,
      });
      const lm = t.leavesMesh.material as THREE.MeshPhongMaterial;
      lm.shininess = 6;
      lm.specular.setHex(0x111111);
      const box = new THREE.Box3().setFromObject(t);
      const k = height / (box.max.y - box.min.y);
      t.scale.setScalar(k);
      t.leavesMesh.userData.noAO = true;
      treeUpdaters.push((tt) => t.update(tt));
      variants.push({ group: t, height });
      return t;
    };
    const birches = [
      make('Aspen Medium', 101, 13, true),
      make('Aspen Large', 202, 17, true),
      make('Aspen Medium', 303, 11, true),
      make('Ash Medium', 404, 12, true),
    ];
    await new Promise((res) => setTimeout(res, 0));
    const pines = [make('Pine Large', 505, 22, false), make('Pine Medium', 606, 17, false), make('Pine Large', 707, 25, false)];

    const placed: THREE.Vector2[] = [];
    const tryPlace = (x: number, z: number, minGap: number) => {
      if ((x - LAKE.x) ** 2 + (z - LAKE.z) ** 2 < (LAKE.r + 4) ** 2) return false;
      if (placed.some((p) => p.distanceToSquared(new THREE.Vector2(x, z)) < minGap * minGap)) return false;
      placed.push(new THREE.Vector2(x, z));
      return true;
    };
    const spawn = (src: THREE.Object3D, x: number, z: number, near: boolean) => {
      const o = src.clone();
      o.position.set(x, 0, z);
      o.rotation.y = r() * Math.PI * 2;
      o.scale.multiplyScalar(0.85 + r() * 0.3);
      o.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.castShadow = near;
          c.receiveShadow = near;
        }
      });
      trees.add(o);
    };
    // a few close birches framing the house (left/back), like the reference photos
    const close: [number, number][] = [[-5.5, -3.5], [-7.5, 3.5], [11.5, -5], [-4, -9], [6.5, -9.5], [14, 3]];
    for (const [x, z] of close) if (tryPlace(x, z, 3)) spawn(birches[Math.floor(r() * birches.length)], x, z, true);
    // mixed forest ring
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      // keep the view towards the front of the house more open
      const front = Math.sin(a) > 0.55;
      const d = (front ? 34 : 17) + r() * (front ? 30 : 38);
      const x = 3 + Math.cos(a) * d;
      const z = 2 + Math.sin(a) * d;
      if (!tryPlace(x, z, 4.5)) continue;
      const pine = r() < 0.55;
      spawn(pine ? pines[Math.floor(r() * pines.length)] : birches[Math.floor(r() * birches.length)], x, z, d < 26);
    }
  }

  return {
    group,
    fitHouse,
    loadVegetation,
    growTrees,
    update(t) {
      time.value = t;
      for (const u of treeUpdaters) u(t);
      const nm = lakeMat.normalMap!;
      nm.offset.set(t * 0.004, t * 0.0025);
    },
    setTrees(v) {
      trees.visible = v;
    },
    setQuality(q) {
      quality = q;
      if (lastHouse) fitHouse(lastHouse);
    },
  };
}
