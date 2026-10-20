import { getProject, PROJECTS } from '../data/projects';

export type WarmMaterial = 'pine' | 'larch' | 'thermo';
export type AccentMaterial = 'profile' | 'planken';
export type AccentColor = 'graphite' | 'anthracite' | 'black' | 'umber';
export type FrameColor = 'black' | 'anthracite' | 'bronze';
export type Glass = 'clear' | 'energy' | 'tinted';
export type DeckMaterial = 'pine' | 'larch' | 'wpc_graphite' | 'wpc_teak';
export type Plinth = 'open' | 'firewood' | 'profile';
export type Stove = 'wood_glass' | 'wood' | 'electric';
export type BenchWood = 'aspen' | 'linden' | 'abachi' | 'cedar';
export type Package = 'shell' | 'turnkey' | 'premium';

export interface Config {
  project: string;
  warmMaterial: WarmMaterial;
  warmOrientation: 'h' | 'v';
  accentMaterial: AccentMaterial;
  accentColor: AccentColor;
  frameColor: FrameColor;
  glass: Glass;
  deck: boolean;
  deckMaterial: DeckMaterial;
  deckExtended: boolean;
  canopy: boolean;
  plinth: Plinth;
  stove: Stove;
  benches: BenchWood;
  benchLight: boolean;
  saltWall: boolean;
  furako: boolean;
  furniture: boolean;
  package: Package;
  insulation: 150 | 200;
  distance: number;
}

const BASE: Omit<Config, 'project'> = {
  warmMaterial: 'pine',
  warmOrientation: 'h',
  accentMaterial: 'profile',
  accentColor: 'graphite',
  frameColor: 'black',
  glass: 'clear',
  deck: true,
  deckMaterial: 'pine',
  deckExtended: false,
  canopy: false,
  plinth: 'open',
  stove: 'wood_glass',
  benches: 'aspen',
  benchLight: true,
  saltWall: false,
  furako: false,
  furniture: true,
  package: 'turnkey',
  insulation: 150,
  distance: 30,
};

export function defaultConfig(projectId: string = PROJECTS[0].id): Config {
  const p = getProject(projectId);
  return { ...BASE, ...p.defaults, project: p.id };
}

/* ---------------------------------------------------------------- URL (de)serialisation */

const KEYS: (keyof Config)[] = [
  'project', 'warmMaterial', 'warmOrientation', 'accentMaterial', 'accentColor', 'frameColor', 'glass',
  'deck', 'deckMaterial', 'deckExtended', 'canopy', 'plinth', 'stove', 'benches', 'benchLight', 'saltWall',
  'furako', 'furniture', 'package', 'insulation', 'distance',
];

export function encodeConfig(c: Config): string {
  const def = defaultConfig(c.project);
  const q = new URLSearchParams();
  q.set('project', c.project);
  for (const k of KEYS) {
    if (k === 'project' || c[k] === def[k]) continue;
    const v = c[k];
    q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  return q.toString();
}

export function decodeConfig(s: string): Config | null {
  const q = new URLSearchParams(s.replace(/^#/, ''));
  const pid = q.get('project');
  if (!pid || !PROJECTS.some((p) => p.id === pid)) return null;
  const c = defaultConfig(pid) as unknown as Record<string, unknown>;
  for (const k of KEYS) {
    const raw = q.get(k);
    if (raw === null || k === 'project') continue;
    const cur = c[k];
    if (typeof cur === 'boolean') c[k] = raw === '1';
    else if (typeof cur === 'number') {
      const n = Number(raw);
      if (Number.isFinite(n)) c[k] = n;
    } else c[k] = raw;
  }
  return c as unknown as Config;
}

/* ---------------------------------------------------------------- store */

type Listener = (c: Config, prev: Config) => void;

export class Store {
  private listeners: Listener[] = [];
  constructor(public config: Config) {}

  set(patch: Partial<Config>) {
    const prev = this.config;
    let next = { ...prev, ...patch };
    if (patch.project && patch.project !== prev.project) next = defaultConfig(patch.project);
    this.config = next;
    for (const l of this.listeners) l(next, prev);
  }

  subscribe(l: Listener) {
    this.listeners.push(l);
    return () => (this.listeners = this.listeners.filter((x) => x !== l));
  }
}
