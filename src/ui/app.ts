import * as THREE from 'three';
import { decodeConfig, defaultConfig, encodeConfig, Store, type Config } from '../core/config';
import { optionDelta, quote, rub, signedRub } from '../core/pricing';
import { optionVisible, SECTIONS, type OptionDef } from '../data/catalog';
import { COMPANY, PRICES_VERIFIED } from '../data/company';
import { computeMetrics } from '../data/metrics';
import { getProject, PROJECTS } from '../data/projects';
import { Engine } from '../scene/engine';
import { buildHouse, type HouseModel } from '../scene/house';
import { createLandscape } from '../scene/landscape';
import { Materials } from '../scene/materials';
import { planDataUrl, planSvg } from './plan';

const ICON = {
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>',
  tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l6 8h-3l4 5H5l4-5H6z"/><path d="M12 16v5"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  logo: '<svg class="brand-mark" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill="#26272b"/><path d="M7.5 24V15l9.5-6.5 9.5 6.5v9" stroke="#d9b58a" stroke-width="2.4" fill="none" stroke-linejoin="round"/><path d="M13 24v-5.5h8V24" stroke="#d9b58a" stroke-width="2.4" fill="none"/></svg>',
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const fmtArea = (n: number) => `${n.toFixed(1).replace('.', ',')} м²`;

function toast(msg: string) {
  const t = el('div', 'toast', msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

export class App {
  store: Store;
  engine!: Engine;
  mats!: Materials;
  house: HouseModel | null = null;
  landscape!: ReturnType<typeof createLandscape>;
  private root: HTMLElement;
  private panelScroll!: HTMLElement;
  private totalEl!: HTMLElement;
  private perEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private stepsEl!: HTMLElement;
  private loaderEl!: HTMLElement;
  private rebuildQueued = false;
  private quality: 'high' | 'low';

  constructor(root: HTMLElement) {
    this.root = root;
    const fromUrl = decodeConfig(location.hash);
    this.store = new Store(fromUrl ?? defaultConfig());
    const forced = new URLSearchParams(location.search).get('q');
    this.quality =
      forced === 'low' || forced === 'high'
        ? forced
        : matchMedia('(max-width: 860px)').matches || navigator.hardwareConcurrency <= 4 ? 'low' : 'high';
    this.layout();
  }

  /* ---------------------------------------------------------------- layout */

  private layout() {
    const top = el('header', 'topbar');
    top.innerHTML = `
      <a class="brand" href="${COMPANY.siteUrl}" target="_blank" rel="noopener">
        ${ICON.logo}
        <div><div class="brand-name">${COMPANY.brand}</div><div class="brand-sub">${COMPANY.tagline} · ${COMPANY.city}</div></div>
      </a>
      <div class="promises">${COMPANY.promises.map((p) => `<span>${p}</span>`).join('')}</div>
      <div class="spacer"></div>
      <div class="top-actions">
        ${COMPANY.phone ? `<a class="phone" href="tel:${COMPANY.phone.replace(/[^+\d]/g, '')}">${COMPANY.phone}</a>` : ''}
        <button class="btn-ghost" data-act="share">${ICON.share}<span>Ссылка</span></button>
        <button class="btn-ghost" data-act="shot">${ICON.camera}<span>Снимок</span></button>
      </div>`;
    top.querySelector('[data-act=share]')!.addEventListener('click', () => this.share());
    top.querySelector('[data-act=shot]')!.addEventListener('click', () => this.saveShot());

    const viewer = el('section', 'viewer');
    const canvas = el('canvas');
    canvas.setAttribute('aria-label', 'Трёхмерная модель бани');
    viewer.appendChild(canvas);
    this.titleEl = el('div', 'v-title');
    viewer.appendChild(this.titleEl);
    viewer.appendChild(el('div', 'hint', 'Вращайте мышью, колесо — масштаб'));
    viewer.appendChild(this.toolbar());
    this.loaderEl = el(
      'div',
      'loader',
      `<div class="loader-inner"><div class="brand-name">${COMPANY.brand}</div>
       <div class="loader-text">Загружаем материалы и сцену…</div><div class="bar"><i></i></div></div>`,
    );
    viewer.appendChild(this.loaderEl);

    const panel = el('aside', 'panel');
    this.stepsEl = el('nav', 'steps');
    this.panelScroll = el('div', 'scroll');
    const foot = el('div', 'foot');
    foot.innerHTML = `
      <div class="total-row">
        <div><div class="total-label">Предварительная стоимость</div><div class="total"></div></div>
        <div class="per"></div>
      </div>
      ${PRICES_VERIFIED ? '' : '<div class="demo-note">Цены ориентировочные, точный расчёт — у менеджера</div>'}
      <div class="foot-actions">
        <button class="btn" data-act="spec">Смета</button>
        <button class="btn btn-primary" data-act="request">Получить точный расчёт</button>
      </div>`;
    this.totalEl = foot.querySelector('.total')!;
    this.perEl = foot.querySelector('.per')!;
    foot.querySelector('[data-act=spec]')!.addEventListener('click', () => this.openSpec());
    foot.querySelector('[data-act=request]')!.addEventListener('click', () => this.openRequest());
    panel.append(this.stepsEl, this.panelScroll, foot);

    this.root.append(top, viewer, panel);

    this.engine = new Engine(canvas as HTMLCanvasElement);
    this.mats = new Materials(this.engine.manager, this.engine.renderer.capabilities.getMaxAnisotropy());
    const bar = this.loaderEl.querySelector('.bar i') as HTMLElement;
    this.engine.manager.onProgress = (_u, loaded, total) => {
      bar.style.width = `${Math.round((loaded / total) * 100)}%`;
    };

    this.renderPanel();
    this.store.subscribe((c, prev) => this.onChange(c, prev));
    this.panelScroll.addEventListener('scroll', () => this.syncSteps());
  }

  private toolbar() {
    const tb = el('div', 'toolbar');
    const views: [string, string][] = [
      ['overview', 'Общий вид'],
      ['terrace', 'Терраса'],
      ['front', 'Фасад'],
      ['back', 'Сзади'],
      ['top', 'Сверху'],
    ];
    for (const [id, label] of views) {
      const b = el('button', 'tb-btn', label);
      b.addEventListener('click', () => this.goView(id));
      tb.appendChild(b);
    }
    tb.appendChild(el('span', 'tb-sep'));
    const day = el('button', 'tb-btn on', `${ICON.sun}<span>День</span>`);
    const eve = el('button', 'tb-btn', `${ICON.moon}<span>Вечер</span>`);
    day.title = 'Дневное освещение';
    eve.title = 'Вечер: подсветка и огонь в печи';
    day.addEventListener('click', () => {
      this.engine.setTimeOfDay('day');
      day.classList.add('on');
      eve.classList.remove('on');
    });
    eve.addEventListener('click', () => {
      this.engine.setTimeOfDay('evening');
      eve.classList.add('on');
      day.classList.remove('on');
    });
    tb.append(day, eve, el('span', 'tb-sep'));
    const rot = el('button', 'tb-btn', ICON.rotate);
    rot.title = 'Автовращение';
    rot.addEventListener('click', () => {
      this.engine.autoRotate = !this.engine.autoRotate;
      rot.classList.toggle('on', this.engine.autoRotate);
    });
    const trees = el('button', 'tb-btn on', ICON.tree);
    trees.title = 'Деревья';
    trees.addEventListener('click', () => {
      const on = !trees.classList.contains('on');
      trees.classList.toggle('on', on);
      this.landscape.setTrees(on);
    });
    const full = el('button', 'tb-btn', ICON.full);
    full.title = 'Во весь экран';
    full.addEventListener('click', () => {
      const v = this.root.querySelector('.viewer') as HTMLElement;
      if (document.fullscreenElement) document.exitFullscreen();
      else v.requestFullscreen?.();
    });
    tb.append(rot, trees, full);
    return tb;
  }

  /* ---------------------------------------------------------------- 3D */

  async start() {
    const { engine } = this;
    engine.setQuality(this.quality);
    this.landscape = createLandscape(this.mats);
    engine.scene.add(this.landscape.group);
    this.landscape.setQuality(this.quality);
    this.rebuild(false);
    engine.onUpdate((t, dt) => this.frame(t, dt));
    const skies = engine.loadSkies();
    const veg = this.landscape.loadVegetation(engine.manager);
    engine.start();
    await Promise.all([skies, veg]);
    this.goView('overview', 0.01);
    // first frames rendered — show the scene, then grow the forest
    setTimeout(() => this.loaderEl.classList.add('done'), 350);
    setTimeout(() => this.landscape.growTrees().catch((e) => console.warn('trees', e)), 600);
  }

  private frame(t: number, dt: number) {
    const e = this.engine.evening;
    const h = this.house;
    if (h) {
      for (const l of h.lights) {
        let v = l.userData.day + (l.userData.night - l.userData.day) * e;
        if (l.userData.flicker) v *= 0.85 + Math.sin(t * 13.1) * 0.06 + Math.sin(t * 7.3 + 1.3) * 0.09;
        l.intensity = v;
      }
      for (const w of h.washes) (w.material as THREE.MeshBasicMaterial).opacity = e * 0.85;
      for (const u of h.updaters) u(t, dt);
      h.smoke?.setEvening(e);
    }
    (this.mats.std.lampGlow as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + e * 9;
    this.landscape.update(t);
  }

  private rebuild(animate = true) {
    const c = this.store.config;
    const old = this.house;
    const house = buildHouse(c, this.mats);
    if (old) {
      this.engine.scene.remove(old.group);
      old.dispose();
    }
    this.house = house;
    this.engine.scene.add(house.group);
    this.landscape.fitHouse(house);
    const box = house.footprint;
    const center = new THREE.Vector3((box.min.x + box.max.x) / 2, 1.4, (box.min.z + box.max.z) / 2);
    const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 + 1.5;
    const moved = center.distanceTo(this.engine.center) > 0.3;
    if (moved || !old) this.engine.frame(center, radius, animate && !!old);
  }

  private goView(id: string, dur = 1.2) {
    const h = this.house;
    if (!h) return;
    const c = this.engine.center;
    const r = this.engine.radius;
    const k = r / 5.5;
    const p = getProject(this.store.config.project);
    const fwd = new THREE.Vector3(p.view[0], 0, p.view[1]).normalize();
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    let pos: THREE.Vector3;
    let target = c.clone();
    switch (id) {
      case 'terrace': {
        const d = h.deckRects[0] ?? [c.x - 1, c.z, c.x + 1, c.z + 2];
        const dc = new THREE.Vector3((d[0] + d[2]) / 2, 1.25, (d[1] + d[3]) / 2);
        pos = dc.clone().addScaledVector(fwd, 5.6).addScaledVector(side, 1.2).setY(1.7);
        target = dc;
        break;
      }
      case 'front':
        pos = c.clone().add(new THREE.Vector3(0.3 * k, 0.3, 12.5 * k));
        break;
      case 'back':
        pos = c.clone().addScaledVector(fwd, -12 * k).addScaledVector(side, 3 * k).setY(3.2);
        break;
      case 'top':
        pos = c.clone().addScaledVector(fwd, 7 * k).add(new THREE.Vector3(0, 12 * k, 0));
        break;
      default:
        pos = c.clone().addScaledVector(fwd, 15.5 * k).addScaledVector(side, -1.0 * k).setY(2.3);
        target = c.clone().add(new THREE.Vector3(0, -0.2, 0));
    }
    this.engine.flyTo(pos, target, dur);
  }

  private onChange(c: Config, prev: Config) {
    history.replaceState(null, '', '#' + encodeConfig(c));
    if (c.project !== prev.project) {
      this.renderPanel();
      this.queueRebuild();
      setTimeout(() => this.goView('overview'), 60);
      return;
    }
    this.updatePanel();
    this.queueRebuild();
  }

  private queueRebuild() {
    if (this.rebuildQueued) return;
    this.rebuildQueued = true;
    requestAnimationFrame(() => {
      this.rebuildQueued = false;
      this.rebuild();
    });
  }

  /* ---------------------------------------------------------------- panel */

  private renderPanel() {
    const c = this.store.config;
    const p = getProject(c.project);
    this.panelScroll.innerHTML = '';
    this.stepsEl.innerHTML = '';
    const addStep = (id: string, title: string) => {
      const b = el('button', 'step', title);
      b.dataset.target = id;
      b.addEventListener('click', () => {
        const sec = this.panelScroll.querySelector<HTMLElement>(`#sec-${id}`);
        if (sec) this.panelScroll.scrollTo({ top: sec.offsetTop - 8, behavior: 'smooth' });
      });
      this.stepsEl.appendChild(b);
    };

    // project selection
    addStep('project', 'Проект');
    const ps = el('div', 'section');
    ps.id = 'sec-project';
    ps.appendChild(el('h2', '', 'Проект'));
    const cards = el('div', 'projects');
    for (const pr of PROJECTS) {
      const m = computeMetrics(pr, defaultConfig(pr.id));
      const card = el('button', 'pcard' + (pr.id === p.id ? ' on' : ''));
      card.innerHTML = `
        <span class="pcard-img" style="background-image:url('${planDataUrl(pr)}');background-size:contain;background-color:#fff"></span>
        <span>
          <div class="pcard-name">${pr.name}</div>
          <div class="pcard-kind">${pr.kind}</div>
          <div class="pcard-meta"><span>${fmtArea(m.internalArea)} · ${pr.size[0].toString().replace('.', ',')}×${pr.size[1].toString().replace('.', ',')} м</span><span class="price">от ${rub(pr.basePrice)}</span></div>
        </span>`;
      card.addEventListener('click', () => {
        if (pr.id !== this.store.config.project) this.store.set({ project: pr.id });
      });
      cards.appendChild(card);
    }
    ps.appendChild(cards);
    ps.appendChild(el('p', 'pdesc', p.description));
    const rooms = el('div', 'rooms');
    for (const r of p.rooms) {
      const a = r.rects.reduce((s, q) => s + (q[2] - q[0]) * (q[3] - q[1]), 0);
      rooms.appendChild(el('span', '', `${r.name} ${fmtArea(a)}`));
    }
    ps.appendChild(rooms);
    this.panelScroll.appendChild(ps);

    for (const sec of SECTIONS) {
      const visible = sec.options.filter((o) => !p.hiddenOptions?.includes(o.key));
      if (!visible.length) continue;
      addStep(sec.id, sec.title);
      const s = el('div', 'section');
      s.id = `sec-${sec.id}`;
      s.appendChild(el('h2', '', sec.title));
      for (const o of visible) {
        const wrap = el('div', 'opt');
        wrap.dataset.key = o.key;
        s.appendChild(wrap);
      }
      this.panelScroll.appendChild(s);
    }
    this.updatePanel();
    this.syncSteps();
    this.renderTitle();
  }

  private renderTitle() {
    const c = this.store.config;
    const p = getProject(c.project);
    const m = computeMetrics(p, c);
    this.titleEl.innerHTML = `
      <div class="kind">${p.kind}</div>
      <h1>${p.name}</h1>
      <div class="v-specs">
        <span>${fmtArea(m.internalArea)} помещений</span>
        <span>${p.size[0].toString().replace('.', ',')} × ${p.size[1].toString().replace('.', ',')} м</span>
        <span>${p.modules} ${p.modules === 1 ? 'модуль' : 'модуля'}</span>
        <span>Изготовление ${p.buildDays} дней</span>
      </div>`;
  }

  private updatePanel() {
    const c = this.store.config;
    const p = getProject(c.project);
    for (const wrap of this.panelScroll.querySelectorAll<HTMLElement>('.opt')) {
      const o = SECTIONS.flatMap((s) => s.options).find((x) => x.key === wrap.dataset.key)!;
      wrap.style.display = optionVisible(o, c, p) ? '' : 'none';
      this.renderOption(wrap, o, c);
    }
    const q = quote(c);
    const prev = this.totalEl.textContent;
    this.totalEl.textContent = rub(q.total);
    if (prev && prev !== this.totalEl.textContent) {
      this.totalEl.classList.add('flash');
      setTimeout(() => this.totalEl.classList.remove('flash'), 500);
    }
    this.perEl.innerHTML = `${rub(q.perM2)} за м²<br>${p.buildDays} дней изготовления`;
    this.renderTitle();
  }

  private priceTag(o: OptionDef, c: Config, v: unknown) {
    if (!o.price) return '';
    const d = optionDelta(o, c, v);
    const cur = c[o.key] === v;
    if (d === 0) return cur ? '<span class="ch-price incl">включено</span>' : '<span class="ch-price incl">0 ₽</span>';
    return `<span class="ch-price">${signedRub(d)}</span>`;
  }

  private renderOption(wrap: HTMLElement, o: OptionDef, c: Config) {
    const cur = c[o.key];
    if (o.kind === 'toggle') {
      const on = Boolean(cur);
      const cost = o.price ? optionDelta(o, c, true) - optionDelta(o, c, false) : 0;
      const tag = cost ? (on ? rub(cost) : signedRub(cost)) : '';
      wrap.innerHTML = `<button class="tg${on ? ' on' : ''}">
          <span class="tg-body"><div class="opt-label">${o.label}</div><div class="tg-text">${o.toggleText ?? ''}</div></span>
          <span class="ch-price${on ? ' incl' : ''}">${tag}</span>
          <span class="switch"></span>
        </button>`;
      wrap.querySelector('button')!.addEventListener('click', () => this.store.set({ [o.key]: !on } as Partial<Config>));
      return;
    }
    if (o.kind === 'range' && o.range) {
      const v = Number(cur);
      const extra = Math.max(0, v - 50);
      const p = getProject(c.project);
      const cost = extra * 160 * p.modules;
      wrap.innerHTML = `
        <div class="opt-head"><span class="opt-label">${o.label}</span><span class="opt-value"><b>${v} ${o.range.unit}</b></span></div>
        ${o.hint ? `<div class="opt-hint">${o.hint}</div>` : ''}
        <input class="range" type="range" min="${o.range.min}" max="${o.range.max}" step="${o.range.step}" value="${v}">
        <div class="range-meta"><span>Доставка манипулятором и монтаж</span><span>${cost ? '+' + rub(cost) : 'бесплатно до 50 км'}</span></div>`;
      const input = wrap.querySelector('input')!;
      input.addEventListener('input', () => this.store.set({ [o.key]: Number(input.value) } as Partial<Config>));
      return;
    }
    const choices = o.choices ?? [];
    const visual = choices.some((ch) => ch.texture || ch.swatch);
    const curCh = choices.find((ch) => ch.value === cur);
    let html = `<div class="opt-head"><span class="opt-label">${o.label}</span><span class="opt-value">${curCh?.label ?? ''}</span></div>`;
    if (o.hint) html += `<div class="opt-hint">${o.hint}</div>`;
    if (visual) {
      html += '<div class="swatches">';
      for (const ch of choices) {
        const bg = ch.texture ? `background-image:url('${ch.texture}')` : `background:${ch.swatch}`;
        const d = o.price ? optionDelta(o, c, ch.value) : 0;
        html += `<button class="sw${ch.value === cur ? ' on' : ''}" data-v="${ch.value}" title="${ch.note ?? ''}">
          <span class="sw-chip" style="${bg}"></span>
          <span class="sw-name">${ch.label}</span>
          ${o.price ? `<span class="sw-price">${d ? signedRub(d) : ch.value === cur ? 'включено' : '0 ₽'}</span>` : ch.note ? `<span class="sw-price">${ch.note}</span>` : ''}
        </button>`;
      }
      html += '</div>';
    } else {
      const two = choices.length === 2 && choices.every((ch) => !ch.note);
      html += `<div class="choices${two ? ' two' : ''}">`;
      for (const ch of choices) {
        html += `<button class="ch${ch.value === cur ? ' on' : ''}" data-v="${ch.value}">
          <span class="ch-dot"></span>
          <span class="ch-body"><div class="ch-label">${ch.label}</div>${ch.note ? `<div class="ch-note">${ch.note}</div>` : ''}</span>
          ${this.priceTag(o, c, ch.value)}
        </button>`;
      }
      html += '</div>';
    }
    wrap.innerHTML = html;
    wrap.querySelectorAll<HTMLElement>('[data-v]').forEach((b) =>
      b.addEventListener('click', () => {
        const raw = b.dataset.v!;
        const v = typeof cur === 'number' ? Number(raw) : raw;
        this.store.set({ [o.key]: v } as Partial<Config>);
      }),
    );
  }

  private syncSteps() {
    const top = this.panelScroll.scrollTop + 40;
    let active = '';
    for (const sec of this.panelScroll.querySelectorAll<HTMLElement>('.section')) {
      if (sec.offsetTop <= top) active = sec.id.replace('sec-', '');
    }
    if (!active) active = 'project';
    for (const b of this.stepsEl.querySelectorAll<HTMLElement>('.step')) b.classList.toggle('on', b.dataset.target === active);
  }

  /* ---------------------------------------------------------------- actions */

  private shareUrl() {
    return `${location.origin}${location.pathname}#${encodeConfig(this.store.config)}`;
  }

  private async share() {
    const url = this.shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast('Ссылка на конфигурацию скопирована');
    } catch {
      prompt('Ссылка на конфигурацию', url);
    }
  }

  private async saveShot() {
    const blob = await this.engine.screenshot(2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `domatek-${this.store.config.project}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Снимок сохранён');
  }

  /** Human-readable list of the selected parameters. */
  private specRows(c: Config) {
    const p = getProject(c.project);
    const rows: { group?: string; label: string; value: string }[] = [];
    const m = computeMetrics(p, c);
    rows.push({ group: 'Проект', label: p.name, value: p.kind });
    rows.push({ label: 'Площадь помещений', value: fmtArea(m.internalArea) });
    rows.push({ label: 'Габариты', value: `${p.size[0]} × ${p.size[1]} м`.replace(/\./g, ',') });
    for (const sec of SECTIONS) {
      let first = true;
      for (const o of sec.options) {
        if (!optionVisible(o, c, p)) continue;
        const v = c[o.key];
        let value: string;
        if (o.kind === 'toggle') value = v ? 'да' : 'нет';
        else if (o.kind === 'range') value = `${v} ${o.range?.unit ?? ''}`;
        else value = o.choices?.find((ch) => ch.value === v)?.label ?? String(v);
        rows.push({ group: first ? sec.title : undefined, label: o.label, value });
        first = false;
      }
    }
    return rows;
  }

  private summaryText(c: Config) {
    const q = quote(c);
    const lines = this.specRows(c).map((r) => `${r.group ? `\n${r.group.toUpperCase()}\n` : ''}${r.label}: ${r.value}`);
    return `${lines.join('\n')}\n\nПредварительная стоимость: ${rub(q.total)}\nСсылка: ${this.shareUrl()}`;
  }

  private modal(title: string, sub: string, body: HTMLElement) {
    const back = el('div', 'modal-back');
    const m = el('div', 'modal');
    const head = el('div', 'modal-head', `<div><h3>${title}</h3><p>${sub}</p></div>`);
    const x = el('button', 'x', '×');
    x.setAttribute('aria-label', 'Закрыть');
    head.appendChild(x);
    const b = el('div', 'modal-body');
    b.appendChild(body);
    m.append(head, b);
    back.appendChild(m);
    const close = () => back.remove();
    x.addEventListener('click', close);
    back.addEventListener('click', (e) => e.target === back && close());
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', esc);
      }
    });
    document.body.appendChild(back);
    return { close, body: b };
  }

  private async openSpec() {
    const c = this.store.config;
    const p = getProject(c.project);
    const q = quote(c);
    const body = el('div');
    const img = el('img', 'shot') as HTMLImageElement;
    img.alt = p.name;
    body.appendChild(img);
    this.engine.screenshot(1).then((b) => (img.src = URL.createObjectURL(b)));
    const plan = el('div', '', planSvg(p, c, { labels: true, pad: 0.4 }));
    plan.style.cssText = 'background:#fff;border-radius:14px;padding:14px;margin-bottom:6px;max-height:260px;display:flex;justify-content:center';
    (plan.firstElementChild as SVGElement).style.cssText = 'width:100%;height:230px';
    body.appendChild(plan);
    const t = el('table', 'spec');
    let html = '';
    for (const r of this.specRows(c)) {
      if (r.group) html += `<tr class="group"><td colspan="2">${r.group}</td></tr>`;
      html += `<tr><td>${r.label}</td><td>${r.value}</td></tr>`;
    }
    html += `<tr class="group"><td colspan="2">Расчёт</td></tr><tr><td>Базовая стоимость проекта</td><td>${rub(q.base)}</td></tr>`;
    for (const l of q.lines) html += `<tr><td>${l.label}</td><td>${signedRub(l.value)}</td></tr>`;
    if (q.delivery) html += `<tr><td>Доставка свыше 50 км</td><td>${signedRub(q.delivery)}</td></tr>`;
    html += `<tr class="sum"><td>Итого</td><td>${rub(q.total)}</td></tr>`;
    t.innerHTML = html;
    body.appendChild(t);
    if (!PRICES_VERIFIED) body.appendChild(el('div', 'demo-note', 'Цены ориентировочные, точную стоимость рассчитает менеджер.'));
    const actions = el('div', 'modal-actions');
    const print = el('button', 'btn', 'Печать / PDF');
    print.addEventListener('click', () => window.print());
    const req = el('button', 'btn btn-primary', 'Получить точный расчёт');
    actions.append(print, req);
    body.appendChild(actions);
    const m = this.modal(`Смета · ${p.name}`, `${COMPANY.brand} · ${new Date().toLocaleDateString('ru-RU')}`, body);
    req.addEventListener('click', () => {
      m.close();
      this.openRequest();
    });
  }

  private openRequest() {
    const c = this.store.config;
    const q = quote(c);
    const form = el('form', 'form');
    form.innerHTML = `
      <div class="field"><label for="f-name">Имя</label><input id="f-name" name="name" required autocomplete="name"></div>
      <div class="field"><label for="f-phone">Телефон</label><input id="f-phone" name="phone" type="tel" required autocomplete="tel" placeholder="+7"></div>
      <div class="field"><label for="f-place">Населённый пункт участка</label><input id="f-place" name="place" placeholder="Например, Бердск"></div>
      <div class="field"><label for="f-comment">Комментарий</label><textarea id="f-comment" name="comment"></textarea></div>
      <label class="check"><input type="checkbox" required> <span>Согласен на обработку персональных данных${COMPANY.privacyPolicyUrl ? ` (<a href="${COMPANY.privacyPolicyUrl}" target="_blank">политика</a>)` : ''}</span></label>
      <div class="modal-actions"><button class="btn btn-primary" type="submit">Отправить заявку</button></div>`;
    const m = this.modal('Точный расчёт', `${getProject(c.project).name} · ${rub(q.total)} — все параметры попадут в заявку`, form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const payload = { ...data, config: c, total: q.total, url: this.shareUrl(), summary: this.summaryText(c) };
      let sent = false;
      if (COMPANY.requestEndpoint) {
        try {
          const r = await fetch(COMPANY.requestEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          sent = r.ok;
        } catch {
          sent = false;
        }
      }
      m.close();
      const body = el('div');
      body.innerHTML = sent
        ? '<p>Заявка отправлена — менеджер свяжется с вами в ближайшее время.</p>'
        : `<p style="margin-top:0">Онлайн-отправка заявок пока не подключена. Текст заявки со всеми параметрами — ниже, его можно скопировать и отправить менеджеру.</p>`;
      if (!sent) {
        const box = el('div', 'summary-box');
        box.textContent = `Имя: ${data.name}\nТелефон: ${data.phone}\nУчасток: ${data.place || '—'}\nКомментарий: ${data.comment || '—'}\n\n${payload.summary}`;
        body.appendChild(box);
        const actions = el('div', 'modal-actions');
        const copy = el('button', 'btn btn-primary', 'Скопировать');
        copy.addEventListener('click', async () => {
          await navigator.clipboard.writeText(box.textContent ?? '').catch(() => undefined);
          toast('Заявка скопирована');
        });
        actions.appendChild(copy);
        body.appendChild(actions);
      }
      this.modal(sent ? 'Спасибо!' : 'Заявка сформирована', COMPANY.brand, body);
    });
  }
}
