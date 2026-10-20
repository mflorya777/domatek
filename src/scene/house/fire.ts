import * as THREE from 'three';

/** Animated flame for the firebox window (procedural fbm, additive). */
export function createFireMaterial(strength = 1) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uStrength: { value: strength } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStrength;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec2 uv = vUv;
        float t = uTime;
        vec2 q = vec2(uv.x * 3.0, uv.y * 2.2 - t * 1.6);
        float n = fbm(q + fbm(q * 1.7 + vec2(0.0, -t * 0.7)));
        // tongues narrow towards the top, embers glow at the bottom
        float shape = (1.0 - uv.y) * 1.35 - abs(uv.x - 0.5) * 0.9;
        float f = smoothstep(0.0, 0.85, n * shape * 1.6);
        float ember = smoothstep(0.25, 0.0, uv.y) * (0.6 + 0.4 * noise(vec2(uv.x * 14.0, t * 2.0)));
        vec3 col = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.62, 0.18), f);
        col = mix(col, vec3(1.0, 0.92, 0.7), smoothstep(0.75, 1.0, f));
        col = col * f * 3.2 + vec3(1.0, 0.32, 0.05) * ember * 1.6;
        float edge = smoothstep(0.0, 0.06, uv.x) * smoothstep(1.0, 0.94, uv.x) * smoothstep(1.0, 0.9, uv.y);
        gl_FragColor = vec4(col * uStrength * edge, 1.0);
      }`,
  });
  return {
    material,
    update: (t: number) => {
      material.uniforms.uTime.value = t;
    },
  };
}
