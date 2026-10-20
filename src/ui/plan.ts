import type { Config } from '../core/config';
import { activeOpenings } from '../data/metrics';
import type { Project } from '../data/projects';

const ROOM_FILL: Record<string, string> = { steam: '#ead7bf', wash: '#dfe3e3', rest: '#f1e8db' };

/** Architectural plan of a project as an SVG string (walls, rooms, openings, deck). */
export function planSvg(p: Project, c?: Config, opts: { labels?: boolean; pad?: number } = {}) {
  const pad = opts.pad ?? 0.5;
  const xs = p.walls.map((w) => w.from[0]);
  const zs = p.walls.map((w) => w.from[1]);
  const deck = [...p.deck.rects, ...(c?.deckExtended && p.deck.extension ? [p.deck.extension] : [])];
  const showDeck = !c || p.id !== 'nord' || c.deck;
  if (showDeck) for (const r of deck) xs.push(r[0], r[2]), zs.push(r[1], r[3]);
  const x0 = Math.min(...xs) - pad;
  const z0 = Math.min(...zs) - pad;
  const w = Math.max(...xs) + pad - x0;
  const h = Math.max(...zs) + pad - z0;
  const parts: string[] = [];
  if (showDeck) {
    for (const r of deck) {
      parts.push(`<rect x="${r[0]}" y="${r[1]}" width="${r[2] - r[0]}" height="${r[3] - r[1]}" fill="url(#deck)" stroke="#b9a68c" stroke-width="0.03"/>`);
    }
  }
  for (const room of p.rooms) {
    for (const r of room.rects) {
      parts.push(`<rect x="${r[0]}" y="${r[1]}" width="${r[2] - r[0]}" height="${r[3] - r[1]}" fill="${ROOM_FILL[room.kind]}"/>`);
    }
  }
  for (const pt of p.partitions) {
    parts.push(`<line x1="${pt.from[0]}" y1="${pt.from[1]}" x2="${pt.to[0]}" y2="${pt.to[1]}" stroke="#2b2c30" stroke-width="0.08"/>`);
  }
  const outline = p.walls.map((wl) => wl.from.join(',')).join(' ');
  parts.push(`<polygon points="${outline}" fill="none" stroke="#16171a" stroke-width="0.16" stroke-linejoin="miter"/>`);
  for (const wl of p.walls) {
    const len = Math.hypot(wl.to[0] - wl.from[0], wl.to[1] - wl.from[1]);
    const ux = (wl.to[0] - wl.from[0]) / len;
    const uz = (wl.to[1] - wl.from[1]) / len;
    const ops = c ? activeOpenings(wl, c) : wl.openings;
    for (const o of ops) {
      if (o.kind === 'firebox') continue;
      const a = [wl.from[0] + ux * (o.at - o.w / 2), wl.from[1] + uz * (o.at - o.w / 2)];
      const b = [wl.from[0] + ux * (o.at + o.w / 2), wl.from[1] + uz * (o.at + o.w / 2)];
      const color = o.kind === 'door' ? '#b5824e' : '#7fb3c9';
      parts.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#fff" stroke-width="0.2"/>`);
      parts.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="0.09"/>`);
    }
  }
  if (opts.labels) {
    for (const room of p.rooms) {
      const r = room.rects[0];
      const area = room.rects.reduce((s, q) => s + (q[2] - q[0]) * (q[3] - q[1]), 0);
      const cx = (r[0] + r[2]) / 2;
      const cz = (r[1] + r[3]) / 2;
      // fit the name into the room width (long names wrap onto two lines)
      const words = room.name.split(' ');
      const lines = words.length > 1 && room.name.length * 0.17 > r[2] - r[0] ? [words[0], words.slice(1).join(' ')] : [room.name];
      const fs = Math.min(0.3, ((r[2] - r[0]) * 0.9) / (Math.max(...lines.map((l) => l.length)) * 0.6));
      lines.forEach((l, i) => {
        parts.push(`<text x="${cx}" y="${cz - 0.05 - (lines.length - 1 - i) * fs * 1.1}" font-size="${fs}" text-anchor="middle" font-weight="700" fill="#16171a">${l}</text>`);
      });
      parts.push(`<text x="${cx}" y="${cz + 0.33}" font-size="0.26" text-anchor="middle" fill="#74777d">${area.toFixed(1).replace('.', ',')} м²</text>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${z0} ${w} ${h}" preserveAspectRatio="xMidYMid meet">
    <defs><pattern id="deck" width="0.146" height="1" patternUnits="userSpaceOnUse">
      <rect width="0.146" height="1" fill="#e8d9c2"/><line x1="0.143" y1="0" x2="0.143" y2="1" stroke="#cdb895" stroke-width="0.012"/>
    </pattern></defs>${parts.join('')}</svg>`;
}

export function planDataUrl(p: Project, c?: Config) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(planSvg(p, c))}`;
}
