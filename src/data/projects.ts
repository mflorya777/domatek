/**
 * Project catalogue. Geometry is described in metres in plan coordinates:
 * x — to the right, z — towards the main (entrance) side, y — up. Ground level is y = 0.
 *
 * The outline of a project is the list of its exterior walls, walked as a closed loop.
 * Every wall carries its cladding zones and openings (windows, doors, stove firebox, lamps).
 */
import type { Config } from '../core/config';

export type Vec2 = [number, number];
/** Axis-aligned rectangle in plan: [x0, z0, x1, z1]. */
export type Rect = [number, number, number, number];

export type CladdingZone = 'warm' | 'accent';

export type OpeningKind = 'window' | 'panorama' | 'door' | 'firebox';

export interface Opening {
  kind: OpeningKind;
  /** Centre of the opening measured along the wall from its start point, m. */
  at: number;
  w: number;
  h: number;
  /** Bottom of the opening above the finished floor, m. */
  sill: number;
}

export interface WallSpec {
  from: Vec2;
  to: Vec2;
  /** Cladding along the wall. A single zone or ranges measured from the wall start. */
  cladding: CladdingZone | { from: number; to: number; zone: CladdingZone }[];
  openings: Opening[];
  /** Wall lights: offsets along the wall. */
  lamps?: number[];
}

export type RoomKind = 'steam' | 'wash' | 'rest';

export interface Room {
  name: string;
  kind: RoomKind;
  rects: Rect[];
}

export interface Steps {
  /** Point on the deck edge where the flight starts (centre of its width). */
  at: Vec2;
  /** Direction in which the flight descends. */
  dir: '+x' | '-x' | '+z' | '-z';
  width: number;
}

export interface Project {
  id: string;
  name: string;
  /** Short line under the name. */
  kind: string;
  description: string;
  modules: number;
  /** Overall plan dimensions, m. */
  size: [number, number];
  buildDays: number;
  /** Base price for the default configuration, ₽. */
  basePrice: number;
  walls: WallSpec[];
  rooms: Room[];
  partitions: { from: Vec2; to: Vec2 }[];
  roof: {
    style: 'flat-metal' | 'timber-fascia';
    /** Roof outline: undefined — follows the walls; otherwise a rectangle (covers a porch). */
    rect?: Rect;
    overhang: number;
  };
  /** Covered porch carved out of the volume (gets a soffit and frame posts). */
  porch?: { rect: Rect; posts: Vec2[] };
  deck: {
    rects: Rect[];
    /** Optional enlargement switched on by the `deckExtended` option. */
    extension?: Rect;
    boardsAlong: 'x' | 'z';
    rim: 'steel' | 'timber';
    steps: Steps;
    /** Steps used when the extension is on. */
    extensionSteps?: Steps;
  };
  /** Covered canopy over the deck (option `canopy`). */
  canopy?: { rect: Rect };
  stove: { at: Vec2; facing: '+x' | '-x' | '+z' | '-z' };
  furniture: { at: Vec2; rot: number; chairs: 1 | 2 }[];
  /** Plan direction from the house centre towards the main viewpoint. */
  view: Vec2;
  defaults: Partial<Config>;
  /** Options that make no sense for the project. */
  hiddenOptions?: (keyof Config)[];
}

export const FLOOR_Y = 0.6; // finished floor above ground
export const CEILING_H = 2.3; // clear interior height
export const WALL_TOP = 3.08; // top of the facade cladding
export const WALL_T = 0.2; // wall thickness from inner lining to sheathing
export const CLAD_BOTTOM = FLOOR_Y - 0.2;

/**
 * «Норд» — two 2.4 × 6 m modules joined in an L, with a deck tucked into the inner corner.
 * Reference: client photo #1 (graphite profiled sheet on the ends, pine on the inner facades).
 */
const NORD: Project = {
  id: 'nord',
  name: 'Норд 29',
  kind: 'Угловая баня из двух модулей с террасой',
  description:
    'Два модуля 2,4 × 6 м под углом: парная и моечная в одном, просторная комната отдыха с панорамным остеклением — в другом. Терраса 13,7 м² во внутреннем углу, печь с выносной топкой со стороны террасы.',
  modules: 2,
  size: [8.4, 6.0],
  buildDays: 45,
  basePrice: 2_480_000,
  walls: [
    { from: [0, 0], to: [0, 2.4], cladding: 'accent', openings: [] },
    {
      from: [0, 2.4],
      to: [6.0, 2.4],
      cladding: 'warm',
      openings: [
        { kind: 'window', at: 1.75, w: 0.6, h: 0.5, sill: 1.35 },
        { kind: 'firebox', at: 3.55, w: 0.5, h: 0.6, sill: 0.22 },
      ],
      lamps: [1.0, 5.55],
    },
    {
      from: [6.0, 2.4],
      to: [6.0, 6.0],
      cladding: 'warm',
      openings: [
        { kind: 'door', at: 0.85, w: 0.9, h: 2.05, sill: 0 },
        { kind: 'panorama', at: 2.62, w: 1.6, h: 2.05, sill: 0.08 },
      ],
      lamps: [1.6],
    },
    {
      from: [6.0, 6.0],
      to: [8.4, 6.0],
      cladding: 'accent',
      openings: [{ kind: 'window', at: 1.4, w: 1.0, h: 0.5, sill: 1.3 }],
      lamps: [0.35],
    },
    { from: [8.4, 6.0], to: [8.4, 0], cladding: 'accent', openings: [{ kind: 'window', at: 1.6, w: 1.0, h: 0.5, sill: 1.3 }] },
    { from: [8.4, 0], to: [0, 0], cladding: 'accent', openings: [{ kind: 'window', at: 7.0, w: 0.5, h: 0.5, sill: 1.4 }] },
  ],
  rooms: [
    { name: 'Моечная', kind: 'wash', rects: [[0, 0, 2.5, 2.4]] },
    { name: 'Парная', kind: 'steam', rects: [[2.5, 0, 6.0, 2.4]] },
    { name: 'Комната отдыха', kind: 'rest', rects: [[6.0, 0, 8.4, 6.0]] },
  ],
  partitions: [
    { from: [2.5, 0], to: [2.5, 2.4] },
    { from: [6.0, 0], to: [6.0, 2.4] },
  ],
  roof: { style: 'flat-metal', overhang: 0.04 },
  deck: {
    rects: [[2.2, 2.4, 6.0, 6.0]],
    boardsAlong: 'z',
    rim: 'steel',
    steps: { at: [2.2, 5.15], dir: '-x', width: 1.1 },
  },
  canopy: { rect: [2.2, 2.4, 6.0, 6.0] },
  stove: { at: [3.55, 2.05], facing: '+z' },
  furniture: [{ at: [4.3, 4.85], rot: 0.5, chairs: 2 }],
  view: [-0.62, 1],
  defaults: {
    warmMaterial: 'pine',
    warmOrientation: 'h',
    accentMaterial: 'profile',
    accentColor: 'graphite',
    deck: true,
    deckMaterial: 'pine',
    plinth: 'open',
  },
  hiddenOptions: ['deckExtended'],
};

/**
 * «Хюгге» — single 3 × 6 m module with a covered porch cut into the facade.
 * Reference: client photo #2 (vertical pine boards, graphite planken, firewood plinth).
 */
const HYGGE: Project = {
  id: 'hygge',
  name: 'Хюгге 15',
  kind: 'Компактная баня с крытым крыльцом',
  description:
    'Один модуль 3 × 6 м: парная с топкой из-под навеса, моечная и комната отдыха с панорамным окном. Крыльцо утоплено в объём — дрова и вход всегда под крышей.',
  modules: 1,
  size: [6.0, 3.0],
  buildDays: 30,
  basePrice: 1_560_000,
  walls: [
    { from: [0, 0], to: [0, 3.0], cladding: 'accent', openings: [{ kind: 'panorama', at: 1.95, w: 1.3, h: 1.9, sill: 0.3 }] },
    { from: [0, 3.0], to: [2.0, 3.0], cladding: 'accent', openings: [] },
    { from: [2.0, 3.0], to: [2.0, 1.8], cladding: 'warm', openings: [] },
    {
      from: [2.0, 1.8],
      to: [4.4, 1.8],
      cladding: [
        { from: 0, to: 1.5, zone: 'warm' },
        { from: 1.5, to: 2.4, zone: 'accent' },
      ],
      openings: [
        { kind: 'door', at: 1.0, w: 0.85, h: 2.0, sill: 0 },
        { kind: 'firebox', at: 1.95, w: 0.42, h: 0.5, sill: 0.3 },
      ],
      lamps: [0.3],
    },
    { from: [4.4, 1.8], to: [4.4, 3.0], cladding: 'accent', openings: [] },
    { from: [4.4, 3.0], to: [6.0, 3.0], cladding: 'warm', openings: [] },
    { from: [6.0, 3.0], to: [6.0, 0], cladding: 'warm', openings: [{ kind: 'window', at: 0.9, w: 0.5, h: 0.5, sill: 1.4 }] },
    { from: [6.0, 0], to: [0, 0], cladding: 'warm', openings: [] },
  ],
  rooms: [
    { name: 'Комната отдыха', kind: 'rest', rects: [[0, 0, 3.5, 1.8], [0, 1.8, 2.0, 3.0]] },
    { name: 'Парная', kind: 'steam', rects: [[3.5, 0, 6.0, 1.8]] },
    { name: 'Моечная', kind: 'wash', rects: [[4.4, 1.8, 6.0, 3.0]] },
  ],
  partitions: [
    { from: [3.5, 0], to: [3.5, 1.8] },
    { from: [4.4, 1.8], to: [6.0, 1.8] },
  ],
  roof: { style: 'timber-fascia', rect: [0, 0, 6.0, 3.0], overhang: 0.14 },
  porch: { rect: [2.0, 1.8, 4.4, 3.0], posts: [[2.0, 3.0], [4.4, 3.0]] },
  deck: {
    rects: [[2.0, 1.8, 4.4, 3.45]],
    extension: [0, 3.0, 6.0, 4.4],
    boardsAlong: 'x',
    rim: 'timber',
    steps: { at: [3.75, 3.45], dir: '+z', width: 1.1 },
    extensionSteps: { at: [5.2, 4.4], dir: '+z', width: 1.2 },
  },
  stove: { at: [3.95, 1.45], facing: '+z' },
  furniture: [{ at: [2.5, 2.55], rot: 0.45, chairs: 1 }],
  view: [-0.55, 1],
  defaults: {
    warmMaterial: 'pine',
    warmOrientation: 'v',
    accentMaterial: 'planken',
    accentColor: 'graphite',
    deck: true,
    deckMaterial: 'pine',
    plinth: 'firewood',
  },
  hiddenOptions: ['canopy', 'deck'],
};

export const PROJECTS: Project[] = [NORD, HYGGE];

export function getProject(id: string): Project {
  return PROJECTS.find((p) => p.id === id) ?? PROJECTS[0];
}
