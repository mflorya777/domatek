import { ALL_OPTIONS, DELIVERY, optionVisible, type OptionDef } from '../data/catalog';
import { computeMetrics } from '../data/metrics';
import { getProject } from '../data/projects';
import { defaultConfig, type Config } from './config';

export interface PriceLine {
  label: string;
  value: number;
}

export interface Quote {
  total: number;
  base: number;
  lines: PriceLine[];
  delivery: number;
  perM2: number;
}

function choiceLabel(o: OptionDef, v: unknown) {
  if (o.kind === 'toggle') return v ? o.label : `${o.label}: без`;
  const ch = o.choices?.find((c) => c.value === v);
  return `${o.label}: ${ch?.label ?? v}`;
}

/** Price of one option value relative to the project default. */
export function optionDelta(o: OptionDef, c: Config, value: unknown): number {
  if (!o.price) return 0;
  const p = getProject(c.project);
  const def = defaultConfig(c.project);
  const withV = { ...c, [o.key]: value } as Config;
  const ctxV = { p, m: computeMetrics(p, withV), c: withV };
  const withD = { ...c, [o.key]: def[o.key] } as Config;
  const ctxD = { p, m: computeMetrics(p, withD), c: withD };
  const rule = o.price as unknown as (v: unknown, ctx: typeof ctxV) => number;
  // area-based options are rounded to hundreds, as in a price list
  return Math.round((rule(value, ctxV) - rule(def[o.key], ctxD)) / 100) * 100;
}

export function quote(c: Config): Quote {
  const p = getProject(c.project);
  const lines: PriceLine[] = [];
  for (const o of ALL_OPTIONS) {
    if (!optionVisible(o, c, p)) continue;
    const d = optionDelta(o, c, c[o.key]);
    if (d !== 0) lines.push({ label: choiceLabel(o, c[o.key]), value: d });
  }
  const extraKm = Math.max(0, c.distance - DELIVERY.freeKm);
  const delivery = extraKm * DELIVERY.perKmPerModule * p.modules;
  const total = p.basePrice + lines.reduce((s, l) => s + l.value, 0) + delivery;
  const area = computeMetrics(p, c).internalArea;
  return { total, base: p.basePrice, lines, delivery, perM2: Math.round(total / area) };
}

export const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} ₽`;
export const signedRub = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + rub(Math.abs(n));
