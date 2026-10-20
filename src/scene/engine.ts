/**
 * Renderer, camera, lighting environment (HDRI sky with a matching sun), post-processing and views.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

export type TimeOfDay = 'day' | 'evening';

interface SkyPreset {
  hdr: string;
  bg: string;
  /** Desired horizontal direction the sunlight comes from (world, x/z). */
  sunFrom: [number, number];
  sunColor: number;
  sunIntensity: number;
  envIntensity: number;
  bgIntensity: number;
  exposure: number;
  fog: number;
  hemi: [number, number, number];
}

const SKIES: Record<TimeOfDay, SkyPreset> = {
  day: {
    hdr: 'assets/hdri/day.hdr',
    bg: 'assets/hdri/day_bg.jpg',
    sunFrom: [-0.75, 1],
    sunColor: 0xfff1df,
    sunIntensity: 3.4,
    envIntensity: 0.9,
    bgIntensity: 1.0,
    exposure: 0.95,
    fog: 0xc4d3de,
    hemi: [0xbfd7ef, 0x5d6b3a, 0.35],
  },
  evening: {
    hdr: 'assets/hdri/evening.hdr',
    bg: 'assets/hdri/evening_bg.jpg',
    sunFrom: [-1, -0.9],
    sunColor: 0xffa25a,
    sunIntensity: 2.0,
    envIntensity: 0.55,
    bgIntensity: 0.85,
    exposure: 0.9,
    fog: 0xc9b9a8,
    hemi: [0x8aa2c4, 0x3a3524, 0.25],
  },
};

export interface ViewPreset {
  id: string;
  label: string;
  /** Camera position relative to the house centre, target offset. */
  pos: [number, number, number];
  target?: [number, number, number];
  fov?: number;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly manager: THREE.LoadingManager;
  private composer: EffectComposer;
  private gtao: GTAOPass;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Clock();
  private updaters: ((t: number, dt: number) => void)[] = [];
  private skies = new Map<TimeOfDay, { env: THREE.Texture; bg: THREE.Texture; sunDir: THREE.Vector3; rot: number }>();
  private pmrem: THREE.PMREMGenerator;
  private camAnim: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number; dur: number } | null = null;
  /** 0 — day, 1 — evening; animated. */
  evening = 0;
  private eveningTarget = 0;
  center = new THREE.Vector3(3, 1.4, 2);
  radius = 6;
  timeOfDay: TimeOfDay = 'day';
  autoRotate = false;
  private idleTime = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.manager = new THREE.LoadingManager();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 900);
    this.camera.position.set(14, 4, 16);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 45;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('start', () => {
      this.camAnim = null;
      this.idleTime = 0;
    });

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 80;
    sc.left = sc.bottom = -14;
    sc.right = sc.top = 14;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd7ef, 0x5d6b3a, 0.35);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.FogExp2(0xc4d3de, 0.0065);

    // post-processing with an MSAA target
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.2, scale: 1.0, samples: 16 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.gtao.blendIntensity = 0.85;
    // objects flagged noAO (glass, foliage cards, decals) are skipped in the G-buffer pass
    const g = this.gtao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
    const orig = g._overrideVisibility.bind(this.gtao);
    g._overrideVisibility = () => {
      orig();
      this.scene.traverse((o) => {
        if (o.visible && (o.userData.noAO || (o as THREE.Sprite).isSprite)) {
          o.visible = false;
          g._visibilityCache.push(o);
        }
      });
    };
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.5, 1.4);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get domElement() {
    return this.canvas;
  }

  onUpdate(fn: (t: number, dt: number) => void) {
    this.updaters.push(fn);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
  }

  setQuality(q: 'high' | 'low') {
    this.gtao.enabled = q === 'high';
    this.renderer.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1.25));
    this.sun.shadow.mapSize.set(q === 'high' ? 4096 : 2048, q === 'high' ? 4096 : 2048);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    this.resize();
  }

  /** Load both skies; the sun direction is taken from the brightest texel of each HDRI. */
  async loadSkies() {
    const hdr = new HDRLoader(this.manager).setDataType(THREE.FloatType);
    const tl = new THREE.TextureLoader(this.manager);
    await Promise.all(
      (Object.keys(SKIES) as TimeOfDay[]).map(async (k) => {
        const s = SKIES[k];
        const [h, bg] = await Promise.all([hdr.loadAsync(s.hdr), tl.loadAsync(s.bg)]);
        h.mapping = THREE.EquirectangularReflectionMapping;
        bg.mapping = THREE.EquirectangularReflectionMapping;
        bg.colorSpace = THREE.SRGBColorSpace;
        bg.anisotropy = 4;
        const texDir = brightestDirection(h);
        // the sun disk is carried by the directional light; clamping it keeps the PMREM (half float) finite
        const data = (h.image as { data: Float32Array }).data;
        for (let i = 0; i < data.length; i++) if (data[i] > 40 || !Number.isFinite(data[i])) data[i] = 40;
        h.needsUpdate = true;
        // rotate the panorama so the sun comes from the preset direction
        const want = Math.atan2(s.sunFrom[1], s.sunFrom[0]);
        const have = Math.atan2(texDir.z, texDir.x);
        const rot = -(want - have);
        const sunDir = texDir.clone().applyEuler(new THREE.Euler(0, rot, 0));
        const env = this.pmrem.fromEquirectangular(h).texture;
        h.dispose();
        this.skies.set(k, { env, bg, sunDir, rot });
      }),
    );
    this.applySky(this.timeOfDay);
  }

  private applySky(k: TimeOfDay) {
    const s = SKIES[k];
    const sky = this.skies.get(k);
    if (!sky) return;
    this.scene.environment = sky.env;
    this.scene.background = sky.bg;
    this.scene.backgroundRotation.set(0, sky.rot, 0);
    this.scene.environmentRotation.set(0, sky.rot, 0);
    this.scene.environmentIntensity = s.envIntensity;
    this.scene.backgroundIntensity = s.bgIntensity;
    this.sun.color.setHex(s.sunColor);
    this.sun.intensity = s.sunIntensity;
    this.sunDir.copy(sky.sunDir);
    // keep the evening sun from grazing too flat (long shadows still, but the house reads)
    if (k === 'evening' && this.sunDir.y < 0.12) this.sunDir.y = 0.12;
    this.sunDir.normalize();
    this.renderer.toneMappingExposure = s.exposure;
    (this.scene.fog as THREE.FogExp2).color.setHex(s.fog);
    this.hemi.color.setHex(s.hemi[0]);
    this.hemi.groundColor.setHex(s.hemi[1]);
    this.hemi.intensity = s.hemi[2];
    this.placeSun();
  }

  private sunDir = new THREE.Vector3(0.4, 0.7, 0.5).normalize();

  private placeSun() {
    this.sun.target.position.copy(this.center).setY(0);
    this.sun.position.copy(this.center).setY(0).addScaledVector(this.sunDir, 40);
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  setTimeOfDay(k: TimeOfDay) {
    this.timeOfDay = k;
    this.eveningTarget = k === 'evening' ? 1 : 0;
    this.applySky(k);
  }

  /** Frame a new subject: centre and approximate radius. */
  frame(center: THREE.Vector3, radius: number, animate = true) {
    const delta = center.clone().sub(this.center);
    this.center.copy(center);
    this.radius = radius;
    this.placeSun();
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -(radius + 6);
    sc.right = sc.top = radius + 6;
    sc.updateProjectionMatrix();
    if (animate) {
      this.flyTo(this.camera.position.clone().add(delta), this.controls.target.clone().add(delta), 0.8);
    } else {
      this.controls.target.copy(center);
    }
  }

  view(v: ViewPreset, dur = 1.2) {
    const r = this.radius / 6;
    const to = this.center.clone().add(new THREE.Vector3(v.pos[0] * r, v.pos[1], v.pos[2] * r));
    const target = this.center.clone().add(new THREE.Vector3(...(v.target ?? [0, 0, 0])));
    this.flyTo(to, target, dur);
  }

  flyTo(pos: THREE.Vector3, target: THREE.Vector3, dur = 1.2) {
    this.camAnim = { from: this.camera.position.clone(), to: pos, tFrom: this.controls.target.clone(), tTo: target, t: 0, dur };
  }

  start() {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    this.evening += (this.eveningTarget - this.evening) * Math.min(1, dt * 3);
    if (this.camAnim) {
      const a = this.camAnim;
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(a.from, a.to, e);
      this.controls.target.lerpVectors(a.tFrom, a.tTo, e);
      if (a.t >= 1) this.camAnim = null;
    }
    this.idleTime += dt;
    this.controls.autoRotate = this.autoRotate && this.idleTime > 1.5 && !this.camAnim;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.update(dt);
    // keep the camera above the ground
    if (this.camera.position.y < 0.35) this.camera.position.y = 0.35;
    for (const u of this.updaters) u(t, dt);
    this.composer.render(dt);
  }

  /** Render the current view at a higher resolution and return a PNG blob. */
  async screenshot(scale = 2): Promise<Blob> {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(scale);
    this.composer.setPixelRatio(scale);
    this.composer.setSize(w, h);
    this.composer.render(0);
    const blob = await new Promise<Blob>((res) => this.canvas.toBlob((b) => res(b!), 'image/png'));
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.resize();
    return blob;
  }
}

function brightestDirection(tex: THREE.DataTexture | THREE.Texture) {
  const img = tex.image as { data: Float32Array; width: number; height: number };
  const { data, width, height } = img;
  let best = -1;
  let bx = 0;
  let by = 0;
  // only the upper hemisphere
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      if (l > best) {
        best = l;
        bx = x;
        by = y;
      }
    }
  }
  const u = (bx + 0.5) / width;
  const v = 1 - (by + 0.5) / height;
  const phi = (u - 0.5) * Math.PI * 2;
  const el = (v - 0.5) * Math.PI;
  return new THREE.Vector3(Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el));
}
