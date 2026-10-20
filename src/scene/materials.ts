/**
 * PBR material library. Materials are cached per key + configuration so a rebuild after an option
 * change reuses GPU textures and programs.
 */
import * as THREE from 'three';
import { ACCENT_HEX, FRAME_HEX } from '../data/catalog';
import type { Config } from '../core/config';

const BASE = 'assets/';

export class Materials {
  private textures = new Map<string, THREE.Texture>();
  private cache = new Map<string, THREE.Material>();
  private loader: THREE.TextureLoader;

  constructor(manager: THREE.LoadingManager, private anisotropy: number) {
    this.loader = new THREE.TextureLoader(manager);
  }

  tex(path: string, srgb = false, repeat = true): THREE.Texture {
    const key = path + srgb;
    let t = this.textures.get(key);
    if (!t) {
      t = this.loader.load(BASE + path);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = this.anisotropy;
      this.textures.set(key, t);
    }
    return t;
  }

  private memo<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.cache.get(key) as T | undefined;
    if (!m) {
      m = make();
      m.name = key;
      this.cache.set(key, m);
    }
    return m;
  }

  /** Generated wood set: wood_<name>, bench_<name>, wpc_<name>. */
  woodSet(name: string, opts: { roughness?: number; normalScale?: number; color?: THREE.ColorRepresentation } = {}) {
    return this.memo(`wood:${name}:${opts.color ?? ''}`, () => {
      const m = new THREE.MeshStandardMaterial({
        map: this.tex(`tex/gen/${name}_color.webp`, true),
        normalMap: this.tex(`tex/gen/${name}_normal.webp`),
        roughnessMap: this.tex(`tex/gen/${name}_rough.webp`),
        roughness: opts.roughness ?? 1,
        metalness: 0,
        color: opts.color ?? 0xffffff,
      });
      const ns = opts.normalScale ?? 0.6;
      m.normalScale.set(ns, ns);
      return m;
    });
  }

  /** Painted planken: graphite wood grain re-tinted to the accent colour. */
  paintedWood(colorKey: string) {
    return this.memo(`painted:${colorKey}`, () => {
      const target = new THREE.Color(ACCENT_HEX[colorKey] ?? 0x3b3e42);
      // the source texture averages ~sRGB 52 → linear 0.034; rescale so the result matches the RAL colour
      const k = 1 / 0.034;
      const m = new THREE.MeshStandardMaterial({
        map: this.tex('tex/gen/wood_graphite_color.webp', true),
        normalMap: this.tex('tex/gen/wood_graphite_normal.webp'),
        roughnessMap: this.tex('tex/gen/wood_graphite_rough.webp'),
        color: new THREE.Color(target.r * k, target.g * k, target.b * k),
        roughness: 1,
      });
      m.normalScale.set(0.9, 0.9);
      return m;
    });
  }

  paintedMetal(colorKey: string, roughness = 0.5) {
    return this.memo(`metal:${colorKey}:${roughness}`, () =>
      new THREE.MeshStandardMaterial({ color: ACCENT_HEX[colorKey] ?? 0x3b3e42, metalness: 0.45, roughness }),
    );
  }

  frame(colorKey: string) {
    return this.memo(`frame:${colorKey}`, () =>
      new THREE.MeshStandardMaterial({ color: FRAME_HEX[colorKey] ?? 0x111214, metalness: 0.55, roughness: 0.38 }),
    );
  }

  glass(kind: string) {
    return this.memo(`glass:${kind}`, () => {
      const tint = kind === 'tinted' ? 0x6f767a : kind === 'energy' ? 0xdfeee8 : 0xf2f7f6;
      return new THREE.MeshPhysicalMaterial({
        color: tint,
        metalness: 0,
        roughness: 0.02,
        transparent: true,
        opacity: kind === 'tinted' ? 0.55 : 0.16,
        envMapIntensity: 1.6,
        ior: 1.52,
        specularIntensity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    });
  }

  get std() {
    return {
      blackSteel: this.memo('blackSteel', () => new THREE.MeshStandardMaterial({ color: 0x1b1c1e, metalness: 0.5, roughness: 0.55 })),
      stainless: this.memo('stainless', () => new THREE.MeshStandardMaterial({ color: 0xd9dcdf, metalness: 1, roughness: 0.24 })),
      galvanized: this.memo('galv', () => new THREE.MeshStandardMaterial({ color: 0x9da2a6, metalness: 0.9, roughness: 0.45 })),
      backing: this.memo('backing', () => new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9 })),
      membrane: this.memo('membrane', () => {
        const m = new THREE.MeshStandardMaterial({
          map: this.tex('tex/membrane/color.webp', true),
          normalMap: this.tex('tex/membrane/normal.webp'),
          roughness: 0.85,
          color: 0x8a8a8a,
        });
        return m;
      }),
      tile: this.memo('tile', () =>
        new THREE.MeshStandardMaterial({
          map: this.tex('tex/concrete/color.webp', true),
          normalMap: this.tex('tex/concrete/normal.webp'),
          color: 0x4a4846,
          roughness: 0.35,
        }),
      ),
      gabbro: this.memo('gabbro', () => {
        const m = new THREE.MeshStandardMaterial({
          map: this.tex('tex/stone/color.webp', true),
          normalMap: this.tex('tex/stone/normal.webp'),
          color: 0x3a3a3a,
          roughness: 0.75,
        });
        return m;
      }),
      salt: this.memo('salt', () =>
        new THREE.MeshStandardMaterial({
          map: this.tex('tex/stone/color.webp', true),
          color: 0xffb08a,
          emissive: 0xff7a3d,
          emissiveIntensity: 0.9,
          emissiveMap: this.tex('tex/stone/color.webp', true),
          roughness: 0.4,
        }),
      ),
      led: this.memo('led', () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb36b, emissiveIntensity: 6 })),
      ledCool: this.memo('ledCool', () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff1dc, emissiveIntensity: 4 })),
      lampOff: this.memo('lampOff', () => new THREE.MeshStandardMaterial({ color: 0x2a2a28, emissive: 0x000000, roughness: 0.4 })),
      cushion: this.memo('cushion', () =>
        new THREE.MeshPhysicalMaterial({ color: 0x8d8a84, roughness: 0.95, sheen: 1, sheenColor: 0xcfcac2, sheenRoughness: 0.6 }),
      ),
      concrete: this.memo('concrete', () =>
        new THREE.MeshStandardMaterial({
          map: this.tex('tex/concrete/color.webp', true),
          normalMap: this.tex('tex/concrete/normal.webp'),
          roughness: 0.9,
        }),
      ),
      charcoal: this.memo('charcoal', () =>
        new THREE.MeshStandardMaterial({ color: 0x141110, emissive: 0xff4a10, emissiveIntensity: 0.35, roughness: 0.95 }),
      ),
      osb: this.memo('osb', () =>
        new THREE.MeshStandardMaterial({
          map: this.tex('tex/gen/wood_pine_color.webp', true),
          color: 0xd9c7a6,
          roughness: 0.9,
        }),
      ),
      lampGlow: this.memo('lampGlow', () => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc58a, emissiveIntensity: 0 })),
      rubber: this.memo('rubber', () => new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.9 })),
    };
  }

  barkMaterial(kind: 'birch' | 'pine') {
    return this.memo(`bark:${kind}`, () => {
      const m = new THREE.MeshStandardMaterial({
        map: this.tex(`ezt/${kind}_color_1k.jpg`, true),
        normalMap: this.tex(`ezt/${kind}_normal_1k.jpg`),
        roughnessMap: this.tex(`ezt/${kind}_roughness_1k.jpg`),
        aoMap: this.tex(`ezt/${kind}_ao_1k.jpg`),
      });
      return m;
    });
  }

  endGrain() {
    return this.memo('endgrain', () => {
      const m = new THREE.MeshStandardMaterial({
        map: this.tex('tex/gen/endgrain_color.webp', true, false),
        normalMap: this.tex('tex/gen/endgrain_normal.webp', false, false),
        roughnessMap: this.tex('tex/gen/endgrain_rough.webp', false, false),
      });
      return m;
    });
  }

  warm(c: Config) {
    return this.woodSet('wood_' + c.warmMaterial, { normalScale: 0.7 });
  }

  accentWood(c: Config) {
    return this.paintedWood(c.accentColor);
  }

  deck(c: Config) {
    if (c.deckMaterial.startsWith('wpc')) return this.woodSet(c.deckMaterial, { normalScale: 0.8 });
    return this.woodSet('wood_' + c.deckMaterial, { normalScale: 0.9, color: 0xf2efe9 });
  }

  lining() {
    return this.woodSet('bench_linden', { normalScale: 0.4, color: 0xfff4e6 });
  }

  bench(c: Config) {
    return this.woodSet('bench_' + c.benches, { normalScale: 0.5 });
  }

  /** Resolve a batch key into a material for the configuration. */
  resolve(key: string, c: Config): THREE.Material {
    const s = this.std;
    switch (key) {
      case 'warm': return this.warm(c);
      case 'accentWood': return this.accentWood(c);
      case 'accentMetal': return this.paintedMetal(c.accentColor, 0.52);
      case 'trim': return this.paintedMetal(c.accentColor, 0.42);
      case 'roofMetal': return this.paintedMetal(c.accentColor, 0.4);
      case 'frame': return this.frame(c.frameColor);
      case 'glass': return this.glass(c.glass);
      case 'deck': return this.deck(c);
      case 'lining': return this.lining();
      case 'bench': return this.bench(c);
      case 'pine': return this.woodSet('wood_pine');
      case 'thermo': return this.woodSet('wood_thermo');
      case 'floor': return this.woodSet('wood_larch', { normalScale: 0.4, color: 0xd9cfc4 });
      default: {
        const m = (s as Record<string, THREE.Material>)[key];
        if (!m) throw new Error('Unknown material ' + key);
        return m;
      }
    }
  }
}
