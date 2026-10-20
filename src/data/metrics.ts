import type { Config } from '../core/config';
import { CEILING_H, CLAD_BOTTOM, WALL_TOP, type Project, type Rect, type WallSpec } from './projects';

export const wallLength = (w: WallSpec) => Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);

export function claddingZones(w: WallSpec) {
  const len = wallLength(w);
  return typeof w.cladding === 'string' ? [{ from: 0, to: len, zone: w.cladding }] : w.cladding;
}

export const rectArea = (r: Rect) => (r[2] - r[0]) * (r[3] - r[1]);

/** Openings that exist for the given configuration (an electric heater has no firebox). */
export function activeOpenings(w: WallSpec, c: Config) {
  return w.openings.filter((o) => !(o.kind === 'firebox' && c.stove === 'electric'));
}

export interface Metrics {
  warmArea: number;
  accentArea: number;
  glazingArea: number;
  openingsCount: number;
  internalArea: number;
  steamArea: number;
  deckArea: number;
  extensionArea: number;
  canopyArea: number;
  perimeter: number;
  height: number;
}

export function computeMetrics(p: Project, c: Config): Metrics {
  const h = WALL_TOP - CLAD_BOTTOM;
  let warm = 0;
  let accent = 0;
  let glazing = 0;
  let count = 0;
  let perimeter = 0;
  for (const w of p.walls) {
    perimeter += wallLength(w);
    for (const z of claddingZones(w)) {
      let a = (z.to - z.from) * h;
      for (const o of activeOpenings(w, c)) {
        const s0 = Math.max(z.from, o.at - o.w / 2);
        const s1 = Math.min(z.to, o.at + o.w / 2);
        if (s1 > s0) a -= (s1 - s0) * o.h;
      }
      if (z.zone === 'warm') warm += a;
      else accent += a;
    }
    for (const o of activeOpenings(w, c)) {
      if (o.kind === 'firebox') continue;
      count++;
      glazing += o.w * o.h * (o.kind === 'door' ? 0.75 : 0.85);
    }
  }
  const rooms = p.rooms.flatMap((r) => r.rects);
  const internalArea = rooms.reduce((s, r) => s + rectArea(r), 0);
  const steamArea = p.rooms.filter((r) => r.kind === 'steam').flatMap((r) => r.rects).reduce((s, r) => s + rectArea(r), 0);
  const deckArea = p.deck.rects.reduce((s, r) => s + rectArea(r), 0);
  return {
    warmArea: warm,
    accentArea: accent,
    glazingArea: glazing,
    openingsCount: count,
    internalArea,
    steamArea,
    deckArea,
    extensionArea: p.deck.extension ? rectArea(p.deck.extension) : 0,
    canopyArea: p.canopy ? rectArea(p.canopy.rect) : 0,
    perimeter,
    height: WALL_TOP + 0.25,
  };
}

export const INTERIOR_HEIGHT = CEILING_H;
