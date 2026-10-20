import * as THREE from 'three';

let smokeTexture: THREE.Texture | null = null;

/** Soft, slightly clumpy puff drawn once into a canvas. */
function getSmokeTexture() {
  if (smokeTexture) return smokeTexture;
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d')!;
  for (let i = 0; i < 14; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.35;
    const y = s / 2 + (Math.random() - 0.5) * s * 0.35;
    const r = s * (0.18 + Math.random() * 0.2);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }
  smokeTexture = new THREE.CanvasTexture(cv);
  smokeTexture.colorSpace = THREE.SRGBColorSpace;
  return smokeTexture;
}

/** Thin wood smoke rising from the chimney, drifting with the wind. */
export function createSmoke(origin: THREE.Vector3) {
  const object = new THREE.Group();
  const count = 36;
  const life = 7;
  const parts: { sprite: THREE.Sprite; age: number; seed: number }[] = [];
  const color = new THREE.Color(0xd9dadc);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({ map: getSmokeTexture(), color, transparent: true, depthWrite: false, opacity: 0 });
    const sprite = new THREE.Sprite(mat);
    sprite.userData.noAO = true;
    object.add(sprite);
    parts.push({ sprite, age: (i / count) * life, seed: Math.random() * 100 });
  }
  let strength = 0.5;
  return {
    object,
    setEvening(v: number) {
      strength = 0.35 + v * 0.45;
      color.setRGB(0.85 - v * 0.25, 0.86 - v * 0.24, 0.88 - v * 0.2);
      for (const p of parts) (p.sprite.material as THREE.SpriteMaterial).color.copy(color);
    },
    update(_t: number, dt: number) {
      for (const p of parts) {
        p.age += dt;
        if (p.age > life) {
          p.age -= life;
          p.seed = Math.random() * 100;
        }
        const k = p.age / life;
        const rise = k * 3.2;
        const drift = k * k * 2.2;
        p.sprite.position.set(
          origin.x + drift + Math.sin(p.seed + p.age * 0.9) * 0.12 * k,
          origin.y + rise,
          origin.z - drift * 0.4 + Math.cos(p.seed + p.age * 0.7) * 0.12 * k,
        );
        const sc = 0.25 + k * 1.6;
        p.sprite.scale.set(sc, sc, sc);
        p.sprite.material.rotation = p.seed + k * 0.8;
        const fadeIn = Math.min(1, k * 8);
        (p.sprite.material as THREE.SpriteMaterial).opacity = fadeIn * (1 - k) * strength;
      }
    },
  };
}
